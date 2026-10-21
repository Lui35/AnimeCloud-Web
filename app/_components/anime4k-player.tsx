"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

export type Anime4KMode = "off" | "a" | "b" | "c" | "aa" | "bb" | "ca";

type PlayerProps = {
  src: string;
  episodeId: string;
  autoPlay?: boolean;
  playsInline?: boolean;
  onLoadedMetadata?: (video: HTMLVideoElement) => void;
  onTimeUpdate?: (video: HTMLVideoElement) => void;
  onPause?: (video: HTMLVideoElement) => void;
  onEnded?: (video: HTMLVideoElement) => void;
};

const STORAGE_KEY = "anime-cloud-anime4k-mode-v1";
const VOLUME_KEY = "anime-cloud-player-volume-v1";
const MODES: { value: Anime4KMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "a", label: "A" },
  { value: "b", label: "B" },
  { value: "c", label: "C" },
  { value: "aa", label: "A+A" },
  { value: "bb", label: "B+B" },
  { value: "ca", label: "C+A" },
];

function modeLabel(mode: Anime4KMode) {
  return MODES.find((option) => option.value === mode)?.label || "Off";
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export const Anime4KPlayer = forwardRef<HTMLVideoElement, PlayerProps>(function Anime4KPlayer({
  src,
  episodeId,
  autoPlay = false,
  playsInline = true,
  onLoadedMetadata,
  onTimeUpdate,
  onPause,
  onEnded,
}, forwardedRef) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const pendingPlayback = useRef<{ position: number; playing: boolean } | null>(null);
  const [mode, setMode] = useState<Anime4KMode>("off");
  const [rendererState, setRendererState] = useState<"off" | "loading" | "active">("off");
  const [message, setMessage] = useState("");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(.5);
  const [seekPreview, setSeekPreview] = useState<{ percent: number; time: number } | null>(null);

  const setVideoRef = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    if (typeof forwardedRef === "function") forwardedRef(video);
    else if (forwardedRef) forwardedRef.current = video;
  }, [forwardedRef]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (MODES.some((option) => option.value === saved)) setMode(saved as Anime4KMode);
    const rawVolume = localStorage.getItem(VOLUME_KEY);
    const savedVolume = rawVolume === null ? Number.NaN : Number(rawVolume);
    const initialVolume = savedVolume >= 0 && savedVolume <= 1 ? savedVolume : .5;
    if (videoRef.current) videoRef.current.volume = initialVolume;
    setVolume(initialVolume);
  }, []);

  useEffect(() => {
    if (mode === "off") {
      setRendererState("off");
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const videoElement = video;
    const canvasElement = canvas;
    if (!("gpu" in navigator) || !navigator.gpu) {
      setMessage("Anime4K needs a browser with WebGPU enabled. Using the normal player.");
      localStorage.setItem(STORAGE_KEY, "off");
      setMode("off");
      return;
    }

    let active = true;
    let restoreFrameCallback: (() => void) | null = null;
    setRendererState("loading");
    setMessage(`Loading Anime4K Mode ${modeLabel(mode)}…`);

    async function start() {
      if (videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise<void>((resolve, reject) => {
          const loaded = () => { cleanup(); resolve(); };
          const failed = () => { cleanup(); reject(new Error("The video could not be loaded for Anime4K.")); };
          const cleanup = () => {
            videoElement.removeEventListener("loadeddata", loaded);
            videoElement.removeEventListener("error", failed);
          };
          videoElement.addEventListener("loadeddata", loaded, { once: true });
          videoElement.addEventListener("error", failed, { once: true });
        });
      }
      if (!active) return;

      const nativeWidth = videoElement.videoWidth;
      const nativeHeight = videoElement.videoHeight;
      if (!nativeWidth || !nativeHeight) throw new Error("The video dimensions are unavailable.");
      const scale = Math.min(2, 3840 / nativeWidth);
      const targetWidth = Math.max(nativeWidth, Math.round(nativeWidth * scale));
      const targetHeight = Math.max(nativeHeight, Math.round(nativeHeight * scale));
      canvasElement.width = targetWidth;
      canvasElement.height = targetHeight;

      const loaded = await import("anime4k-webgpu");
      const library = ((loaded as unknown as { default?: typeof loaded }).default || loaded);
      const Mode = {
        a: library.ModeA,
        b: library.ModeB,
        c: library.ModeC,
        aa: library.ModeAA,
        bb: library.ModeBB,
        ca: library.ModeCA,
      }[mode as Exclude<Anime4KMode, "off">];

      const originalRequestFrame = videoElement.requestVideoFrameCallback.bind(videoElement);
      videoElement.requestVideoFrameCallback = (callback) => originalRequestFrame((now, metadata) => {
        if (!active) return;
        try {
          callback(now, metadata);
        } catch (error) {
          active = false;
          const reason = error instanceof Error ? error.message : "The GPU renderer stopped.";
          setMessage(`Anime4K stopped: ${reason} Using the normal player.`);
          localStorage.setItem(STORAGE_KEY, "off");
          setMode("off");
        }
      });
      restoreFrameCallback = () => { videoElement.requestVideoFrameCallback = originalRequestFrame; };

      await library.render({
        video: videoElement,
        canvas: canvasElement,
        pipelineBuilder: (device, inputTexture) => [new Mode({
          device,
          inputTexture,
          nativeDimensions: { width: nativeWidth, height: nativeHeight },
          targetDimensions: { width: targetWidth, height: targetHeight },
        })],
      });
      if (!active) return;
      setRendererState("active");
      setMessage(`Anime4K Mode ${modeLabel(mode)} is active · ${targetWidth}×${targetHeight}`);
    }

    void start().catch((error) => {
      if (!active) return;
      const reason = error instanceof Error ? error.message : "WebGPU initialization failed.";
      setMessage(`Anime4K unavailable: ${reason} Using the normal player.`);
      localStorage.setItem(STORAGE_KEY, "off");
      setMode("off");
    });

    return () => {
      active = false;
      restoreFrameCallback?.();
    };
  }, [mode, episodeId]);

  function changeMode(nextMode: Anime4KMode) {
    if (nextMode === mode) return;
    const video = videoRef.current;
    if (video) pendingPlayback.current = { position: video.currentTime, playing: !video.paused };
    localStorage.setItem(STORAGE_KEY, nextMode);
    setMessage(nextMode === "off" ? "Anime4K is off." : `Switching to Anime4K Mode ${modeLabel(nextMode)}…`);
    setMode(nextMode);
  }

  function handleLoadedMetadata(video: HTMLVideoElement) {
    onLoadedMetadata?.(video);
    setDuration(video.duration || 0);
    const pending = pendingPlayback.current;
    if (!pending) return;
    pendingPlayback.current = null;
    if (pending.position > 0 && pending.position < video.duration) video.currentTime = pending.position;
    if (pending.playing) void video.play().catch(() => setMessage("Press play to continue after changing Anime4K mode."));
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shellRef.current?.requestFullscreen();
  }

  function previewSeek(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const percent = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setSeekPreview({ percent: Math.min(97, Math.max(3, percent * 100)), time: percent * duration });
  }

  const enhanced = mode !== "off" && rendererState === "active";
  const mediaSrc = mode === "off" ? src : `/api/episodes/${encodeURIComponent(episodeId)}/stream`;
  const canvasStyle = { aspectRatio: `${canvasRef.current?.width || 16} / ${canvasRef.current?.height || 9}` } as CSSProperties;

  return <div className={`anime4k-player ${enhanced ? "anime4k-active" : ""}`} ref={shellRef}>
    <video
      ref={setVideoRef}
      src={mediaSrc}
      controls={!enhanced}
      autoPlay={autoPlay}
      playsInline={playsInline}
      crossOrigin={mode === "off" ? undefined : "anonymous"}
      onLoadedMetadata={(event) => handleLoadedMetadata(event.currentTarget)}
      onTimeUpdate={(event) => { setCurrentTime(event.currentTarget.currentTime); onTimeUpdate?.(event.currentTarget); }}
      onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
      onPlay={() => setPlaying(true)}
      onPause={(event) => { setPlaying(false); onPause?.(event.currentTarget); }}
      onEnded={(event) => { setPlaying(false); onEnded?.(event.currentTarget); }}
      onVolumeChange={(event) => { setMuted(event.currentTarget.muted); setVolume(event.currentTarget.volume); localStorage.setItem(VOLUME_KEY, String(event.currentTarget.volume)); }}
    />
    <canvas ref={canvasRef} style={canvasStyle} aria-hidden="true" />

    <div className="anime4k-modes" role="group" aria-label="Anime4K mode">
      <span>Anime4K</span>
      {MODES.map((option) => <button type="button" className={mode === option.value ? "active" : ""} aria-pressed={mode === option.value} onClick={() => changeMode(option.value)} key={option.value}>{option.label}</button>)}
    </div>

    {enhanced && <div className="anime4k-controls">
      <button type="button" onClick={togglePlayback} aria-label={playing ? "Pause" : "Play"}>{playing ? "❚❚" : "▶"}</button>
      <span>{formatTime(currentTime)}</span>
      <div className="anime4k-seek" onPointerMove={previewSeek} onPointerLeave={() => setSeekPreview(null)}>
        {seekPreview && <output style={{ left: `${seekPreview.percent}%` }}>{formatTime(seekPreview.time)}</output>}
        <input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} style={{ "--seek-progress": `${duration ? currentTime / duration * 100 : 0}%` } as CSSProperties} onInput={(event) => { const video = videoRef.current; if (video) video.currentTime = Number(event.currentTarget.value); }} aria-label="Seek video" />
      </div>
      <span>{formatTime(duration)}</span>
      <button type="button" onClick={() => { const video = videoRef.current; if (video) video.muted = !video.muted; }} aria-label={muted ? "Unmute" : "Mute"} title={muted ? "Unmute" : "Mute"}>{muted ? "🔇" : "🔊"}</button>
      <input className="anime4k-volume" type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} onInput={(event) => { const video = videoRef.current; if (video) { const nextVolume = Number(event.currentTarget.value); video.volume = nextVolume; video.muted = false; localStorage.setItem(VOLUME_KEY, String(nextVolume)); } }} aria-label={`Volume ${Math.round(volume * 100)}%`} title={`Volume ${Math.round(volume * 100)}%`} />
      <button type="button" onClick={toggleFullscreen} aria-label="Toggle fullscreen">⛶</button>
    </div>}

    {message && <div className="anime4k-status" role="status">{message}</div>}
  </div>;
});
