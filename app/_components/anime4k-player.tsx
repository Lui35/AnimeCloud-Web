"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

export type Anime4KMode = "off" | "a" | "b" | "c" | "aa" | "bb" | "ca";
type EnhancedMode = Exclude<Anime4KMode, "off">;

type BenchmarkResult = {
  mode: EnhancedMode;
  fps: number;
  sourceFps: number;
  queueLatency: number;
  droppedPercent: number;
  smooth: boolean;
  score: number;
};

type BenchmarkState = {
  phase: "idle" | "running" | "complete" | "error";
  currentMode?: EnhancedMode;
  currentIndex: number;
  progress: number;
  stage: string;
  results: BenchmarkResult[];
  recommendation?: EnhancedMode;
};

type BenchmarkCollector = {
  mode: EnhancedMode;
  startedAt: number;
  submitted: number;
  mediaTimes: number[];
  queueLatencies: number[];
};

type GpuDevice = { queue: { onSubmittedWorkDone: () => Promise<unknown> } };

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
const BENCHMARK_MODES = MODES.filter((option): option is { value: EnhancedMode; label: string } => option.value !== "off");
const HEAVY_MODES = new Set<EnhancedMode>(["aa", "bb", "ca"]);
const BENCHMARK_WARMUP_MS = 700;
const BENCHMARK_SAMPLE_MS = 2200;

function percentile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function estimateSourceFps(mediaTimes: number[]) {
  const deltas = mediaTimes.slice(1).map((value, index) => value - mediaTimes[index]).filter((value) => value > .005 && value < .2);
  const median = percentile(deltas, .5);
  return median ? Math.min(120, 1 / median) : 24;
}

function recommendMode(results: BenchmarkResult[]) {
  const smooth = results.filter((result) => result.smooth);
  if (!smooth.length) return undefined;
  const heavy = smooth.filter((result) => HEAVY_MODES.has(result.mode));
  return [...(heavy.length ? heavy : smooth)].sort((a, b) => b.score - a.score || a.queueLatency - b.queueLatency)[0]?.mode;
}

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
  const pendingPlayback = useRef<{ position: number; playing: boolean; finishBenchmarkRestore?: boolean } | null>(null);
  const modeRef = useRef<Anime4KMode>("off");
  const gpuDeviceRef = useRef<GpuDevice | null>(null);
  const rendererSnapshot = useRef<{ mode: Anime4KMode; state: "off" | "loading" | "active"; error: string }>({ mode: "off", state: "off", error: "" });
  const benchmarkCollector = useRef<BenchmarkCollector | null>(null);
  const benchmarkRun = useRef(0);
  const hudTimer = useRef<number | null>(null);
  const benchmarking = useRef(false);
  const benchmarkRestore = useRef<{ mode: Anime4KMode; position: number; playing: boolean; muted: boolean; volume: number } | null>(null);
  const [mode, setMode] = useState<Anime4KMode>("off");
  const [rendererState, setRendererState] = useState<"off" | "loading" | "active">("off");
  const [message, setMessage] = useState("");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(.5);
  const [seekPreview, setSeekPreview] = useState<{ percent: number; time: number } | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkState>({ phase: "idle", currentIndex: 0, progress: 0, stage: "", results: [] });
  const [fullscreen, setFullscreen] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);

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
    modeRef.current = mode;
    rendererSnapshot.current = { ...rendererSnapshot.current, mode, state: rendererState };
  }, [mode, rendererState]);

  useEffect(() => {
    if (mode === "off") {
      gpuDeviceRef.current = null;
      setRendererState("off");
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const videoElement = video;
    const canvasElement = canvas;
    if (!("gpu" in navigator) || !navigator.gpu) {
      const reason = "Anime4K needs a browser with WebGPU enabled.";
      rendererSnapshot.current.error = reason;
      setMessage(`${reason} Using the normal player.`);
      localStorage.setItem(STORAGE_KEY, "off");
      setMode("off");
      return;
    }

    let active = true;
    let restoreFrameCallback: (() => void) | null = null;
    gpuDeviceRef.current = null;
    rendererSnapshot.current.error = "";
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
        const collector = benchmarkCollector.current;
        const collecting = collector?.mode === mode;
        const submittedAt = collecting ? performance.now() : 0;
        if (collector && collecting) {
          collector.submitted += 1;
          collector.mediaTimes.push(metadata.mediaTime);
        }
        try {
          callback(now, metadata);
          const device = gpuDeviceRef.current;
          if (collector && collecting && device) {
            void device.queue.onSubmittedWorkDone().then(() => collector.queueLatencies.push(performance.now() - submittedAt)).catch(() => undefined);
          }
        } catch (error) {
          active = false;
          const reason = error instanceof Error ? error.message : "The GPU renderer stopped.";
          rendererSnapshot.current.error = reason;
          setMessage(`Anime4K stopped: ${reason} Using the normal player.`);
          localStorage.setItem(STORAGE_KEY, "off");
          setMode("off");
        }
      });
      restoreFrameCallback = () => { videoElement.requestVideoFrameCallback = originalRequestFrame; };

      await library.render({
        video: videoElement,
        canvas: canvasElement,
        pipelineBuilder: (device, inputTexture) => {
          gpuDeviceRef.current = device as GpuDevice;
          return [new Mode({
            device,
            inputTexture,
            nativeDimensions: { width: nativeWidth, height: nativeHeight },
            targetDimensions: { width: targetWidth, height: targetHeight },
          })];
        },
      });
      if (!active) return;
      setRendererState("active");
      setMessage(`Anime4K Mode ${modeLabel(mode)} is active · ${targetWidth}×${targetHeight}`);
    }

    void start().catch((error) => {
      if (!active) return;
      const reason = error instanceof Error ? error.message : "WebGPU initialization failed.";
      rendererSnapshot.current.error = reason;
      setMessage(`Anime4K unavailable: ${reason} Using the normal player.`);
      localStorage.setItem(STORAGE_KEY, "off");
      setMode("off");
    });

    return () => {
      active = false;
      restoreFrameCallback?.();
    };
  }, [mode, episodeId]);

  useEffect(() => () => {
    benchmarkRun.current += 1;
    benchmarkCollector.current = null;
    benchmarking.current = false;
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(document.fullscreenElement === shellRef.current);
      setHudVisible(true);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (hudTimer.current !== null) window.clearTimeout(hudTimer.current);
    hudTimer.current = null;
    setHudVisible(true);
    if (fullscreen && playing && benchmark.phase === "idle" && !shellRef.current?.querySelector(":focus-visible")) {
      hudTimer.current = window.setTimeout(() => setHudVisible(false), 2500);
    }
    return () => {
      if (hudTimer.current !== null) window.clearTimeout(hudTimer.current);
    };
  }, [fullscreen, playing, benchmark.phase]);

  function benchmarkIsActive(runId: number) {
    return benchmarkRun.current === runId;
  }

  async function waitForRenderer(targetMode: EnhancedMode, runId: number) {
    const deadline = performance.now() + 15000;
    while (benchmarkIsActive(runId) && performance.now() < deadline) {
      const snapshot = rendererSnapshot.current;
      if (snapshot.error) throw new Error(snapshot.error);
      if (snapshot.mode === targetMode && snapshot.state === "active" && gpuDeviceRef.current) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (benchmarkIsActive(runId)) throw new Error(`Mode ${modeLabel(targetMode)} did not become ready in time.`);
  }

  async function timedBenchmarkStage(runId: number, index: number, stage: string, durationMs: number, startProgress: number, endProgress: number) {
    const startedAt = performance.now();
    while (benchmarkIsActive(runId)) {
      const elapsed = performance.now() - startedAt;
      const ratio = Math.min(1, elapsed / durationMs);
      setBenchmark((current) => current.phase === "running" ? { ...current, currentIndex: index, stage, progress: startProgress + (endProgress - startProgress) * ratio } : current);
      if (ratio >= 1) return;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  function restoreBenchmarkPlayback() {
    const saved = benchmarkRestore.current;
    const video = videoRef.current;
    if (!saved || !video) {
      benchmarking.current = false;
      return;
    }
    benchmarkRestore.current = null;
    const crossesPlayerSource = (saved.mode === "off") !== (modeRef.current === "off");
    localStorage.setItem(STORAGE_KEY, saved.mode);
    video.muted = saved.muted;
    video.volume = saved.volume;
    if (crossesPlayerSource) {
      pendingPlayback.current = { position: saved.position, playing: saved.playing, finishBenchmarkRestore: true };
    } else {
      if (saved.position > 0 && saved.position < video.duration) video.currentTime = saved.position;
      if (saved.playing) void video.play().catch(() => undefined);
      else video.pause();
      benchmarking.current = false;
    }
    setMode(saved.mode);
  }

  function cancelBenchmark() {
    benchmarkRun.current += 1;
    benchmarkCollector.current = null;
    restoreBenchmarkPlayback();
    setBenchmark({ phase: "idle", currentIndex: 0, progress: 0, stage: "", results: [] });
    setMessage("Anime4K benchmark canceled. Playback settings restored.");
  }

  async function startBenchmark() {
    const video = videoRef.current;
    if (!video || benchmark.phase === "running") return;
    if (!("gpu" in navigator) || !navigator.gpu) {
      setBenchmark({ phase: "error", currentIndex: 0, progress: 0, stage: "WebGPU is unavailable in this browser.", results: [] });
      return;
    }

    const runId = ++benchmarkRun.current;
    benchmarkRestore.current = { mode: modeRef.current, position: video.currentTime, playing: !video.paused, muted: video.muted, volume: video.volume };
    benchmarking.current = true;
    video.muted = true;
    setBenchmark({ phase: "running", currentIndex: 0, progress: 0, stage: "Preparing the video workload…", results: [] });
    const results: BenchmarkResult[] = [];

    try {
      for (let index = 0; index < BENCHMARK_MODES.length; index += 1) {
        const option = BENCHMARK_MODES[index];
        if (!benchmarkIsActive(runId)) return;
        const baseProgress = index / BENCHMARK_MODES.length * 100;
        const endProgress = (index + 1) / BENCHMARK_MODES.length * 100;
        rendererSnapshot.current.error = "";
        setBenchmark((current) => ({ ...current, currentMode: option.value, currentIndex: index, progress: baseProgress, stage: `Loading Mode ${option.label}…` }));
        setMessage(`Benchmark ${index + 1} of ${BENCHMARK_MODES.length}: loading Anime4K Mode ${option.label}…`);
        setMode(option.value);
        await waitForRenderer(option.value, runId);
        if (!benchmarkIsActive(runId)) return;

        if (video.duration > 35 && video.currentTime > video.duration - 25) video.currentTime = Math.max(5, video.duration * .4);
        await video.play();
        await timedBenchmarkStage(runId, index, `Warming up Mode ${option.label}…`, BENCHMARK_WARMUP_MS, baseProgress, baseProgress + (endProgress - baseProgress) * .22);
        if (!benchmarkIsActive(runId)) return;

        const qualityBefore = video.getVideoPlaybackQuality?.();
        const collector: BenchmarkCollector = { mode: option.value, startedAt: performance.now(), submitted: 0, mediaTimes: [], queueLatencies: [] };
        benchmarkCollector.current = collector;
        await timedBenchmarkStage(runId, index, `Measuring Mode ${option.label}…`, BENCHMARK_SAMPLE_MS, baseProgress + (endProgress - baseProgress) * .22, endProgress - 1);
        benchmarkCollector.current = null;
        if (!benchmarkIsActive(runId)) return;

        const device = gpuDeviceRef.current;
        if (!device) throw new Error(`The GPU device for Mode ${option.label} was lost.`);
        await Promise.race([
          device.queue.onSubmittedWorkDone(),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Mode ${option.label} overloaded the GPU queue.`)), 5000)),
        ]);
        await Promise.resolve();

        const finishedAt = performance.now();
        const qualityAfter = video.getVideoPlaybackQuality?.();
        const totalFrames = Math.max(1, (qualityAfter?.totalVideoFrames || 0) - (qualityBefore?.totalVideoFrames || 0));
        const droppedFrames = Math.max(0, (qualityAfter?.droppedVideoFrames || 0) - (qualityBefore?.droppedVideoFrames || 0));
        const droppedPercent = droppedFrames / totalFrames * 100;
        const sourceFps = estimateSourceFps(collector.mediaTimes);
        const fps = collector.submitted / Math.max(.001, (finishedAt - collector.startedAt) / 1000);
        const frameBudget = 1000 / sourceFps;
        const queueLatency = percentile(collector.queueLatencies, .95) || (fps ? 1000 / fps : 999);
        const throughputScore = Math.min(1, fps / sourceFps);
        const latencyScore = Math.min(1, frameBudget / Math.max(frameBudget, queueLatency));
        const dropScore = 1 - Math.min(1, droppedPercent / 10);
        const score = Math.round((throughputScore * .65 + latencyScore * .25 + dropScore * .1) * 100);
        const smooth = throughputScore >= .9 && queueLatency <= frameBudget * 2.5 && droppedPercent < 5;
        const result = { mode: option.value, fps, sourceFps, queueLatency, droppedPercent, smooth, score };
        results.push(result);
        setBenchmark((current) => ({ ...current, progress: endProgress, results: [...results], stage: `Mode ${option.label}: ${smooth ? "smooth" : "limited"}` }));
      }

      if (!benchmarkIsActive(runId)) return;
      const recommendation = recommendMode(results);
      setBenchmark({ phase: "complete", currentIndex: BENCHMARK_MODES.length - 1, progress: 100, stage: recommendation ? `Recommended: Mode ${modeLabel(recommendation)}` : "No mode sustained smooth playback.", results, recommendation });
      setMessage(recommendation ? `Benchmark complete. Mode ${modeLabel(recommendation)} is the best fit for this device.` : "Benchmark complete. Keep Anime4K off for reliably smooth playback on this device.");
    } catch (error) {
      if (!benchmarkIsActive(runId)) return;
      const reason = error instanceof Error ? error.message : "The benchmark could not finish.";
      setBenchmark({ phase: "error", currentIndex: 0, progress: 0, stage: reason, results });
      setMessage(`Anime4K benchmark stopped: ${reason}`);
    } finally {
      if (benchmarkIsActive(runId)) {
        benchmarkCollector.current = null;
        restoreBenchmarkPlayback();
      }
    }
  }

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
    if (pending.finishBenchmarkRestore) benchmarking.current = false;
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

  function holdHudOpen() {
    if (hudTimer.current !== null) window.clearTimeout(hudTimer.current);
    hudTimer.current = null;
    setHudVisible(true);
  }

  function revealHud() {
    holdHudOpen();
    if (fullscreen && playing && benchmark.phase === "idle" && !shellRef.current?.querySelector(":focus-visible")) {
      hudTimer.current = window.setTimeout(() => setHudVisible(false), 2500);
    }
  }

  function focusHud() {
    holdHudOpen();
    if (fullscreen && playing && benchmark.phase === "idle" && !shellRef.current?.querySelector(":focus-visible")) {
      hudTimer.current = window.setTimeout(() => setHudVisible(false), 2500);
    }
  }

  function previewSeek(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const percent = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setSeekPreview({ percent: Math.min(97, Math.max(3, percent * 100)), time: percent * duration });
  }

  const enhanced = mode !== "off" && rendererState === "active";
  const mediaSrc = mode === "off" ? src : `/api/episodes/${encodeURIComponent(episodeId)}/stream`;
  const canvasStyle = { aspectRatio: `${canvasRef.current?.width || 16} / ${canvasRef.current?.height || 9}` } as CSSProperties;

  return <div
    className={`anime4k-player ${enhanced ? "anime4k-active" : ""} ${fullscreen && !hudVisible ? "anime4k-hud-hidden" : ""}`}
    ref={shellRef}
    onPointerMove={revealHud}
    onPointerDown={revealHud}
    onKeyDownCapture={revealHud}
    onFocusCapture={focusHud}
    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) revealHud(); }}
  >
    <video
      ref={setVideoRef}
      src={mediaSrc}
      controls={!enhanced}
      autoPlay={autoPlay}
      playsInline={playsInline}
      crossOrigin={mode === "off" ? undefined : "anonymous"}
      onLoadedMetadata={(event) => handleLoadedMetadata(event.currentTarget)}
      onTimeUpdate={(event) => { setCurrentTime(event.currentTarget.currentTime); if (!benchmarking.current) onTimeUpdate?.(event.currentTarget); }}
      onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
      onPlay={() => setPlaying(true)}
      onPause={(event) => { setPlaying(false); if (!benchmarking.current) onPause?.(event.currentTarget); }}
      onEnded={(event) => { setPlaying(false); if (!benchmarking.current) onEnded?.(event.currentTarget); }}
      onVolumeChange={(event) => { setMuted(event.currentTarget.muted); setVolume(event.currentTarget.volume); localStorage.setItem(VOLUME_KEY, String(event.currentTarget.volume)); }}
    />
    <canvas ref={canvasRef} style={canvasStyle} aria-hidden="true" />

    <div className="anime4k-modes" role="group" aria-label="Anime4K mode">
      <span>Anime4K</span>
      {MODES.map((option) => <button type="button" className={mode === option.value ? "active" : ""} aria-pressed={mode === option.value} disabled={benchmark.phase === "running"} onClick={() => changeMode(option.value)} key={option.value}>{option.label}</button>)}
      <button type="button" className="anime4k-benchmark-trigger" aria-expanded={benchmark.phase !== "idle"} disabled={benchmark.phase === "running"} onClick={() => void startBenchmark()}>Benchmark</button>
    </div>

    {benchmark.phase !== "idle" && <section className="anime4k-benchmark" aria-label="Anime4K performance benchmark">
      <header>
        <div>
          <span className="anime4k-benchmark-kicker">GPU compatibility test</span>
          <h3>{benchmark.phase === "running" ? `Testing Mode ${modeLabel(benchmark.currentMode || "off")}` : benchmark.phase === "complete" ? "Benchmark results" : "Benchmark stopped"}</h3>
        </div>
        {benchmark.phase !== "running" && <button type="button" className="anime4k-benchmark-close" aria-label="Close benchmark results" onClick={() => setBenchmark({ phase: "idle", currentIndex: 0, progress: 0, stage: "", results: [] })}>Close</button>}
      </header>

      {benchmark.phase === "running" && <>
        <div className="anime4k-benchmark-progress" role="progressbar" aria-label="Anime4K benchmark progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(benchmark.progress)}>
          <i style={{ width: `${benchmark.progress}%` }} />
        </div>
        <div className="anime4k-benchmark-step" aria-live="polite">
          <span>Mode {benchmark.currentIndex + 1} of {BENCHMARK_MODES.length}</span>
          <strong>{benchmark.stage}</strong>
        </div>
        <p>The player is muted temporarily. Your original mode, position, and playback state will be restored.</p>
        <button type="button" className="anime4k-benchmark-cancel" onClick={cancelBenchmark}>Cancel benchmark</button>
      </>}

      {benchmark.phase === "complete" && <>
        <p>{benchmark.recommendation ? `Mode ${modeLabel(benchmark.recommendation)} delivered the strongest smooth result on this device.` : "None of the Anime4K modes sustained the source frame rate. The normal player is recommended."}</p>
        <div className="anime4k-benchmark-table-wrap">
          <table>
            <thead><tr><th>Mode</th><th>Effective FPS</th><th>Queue p95</th><th>Dropped</th><th>Result</th></tr></thead>
            <tbody>{benchmark.results.map((result) => <tr className={result.mode === benchmark.recommendation ? "recommended" : ""} key={result.mode}>
              <th scope="row">{modeLabel(result.mode)}{result.mode === benchmark.recommendation && <small>Recommended</small>}</th>
              <td>{result.fps.toFixed(1)}<small>of {result.sourceFps.toFixed(1)}</small></td>
              <td>{result.queueLatency.toFixed(1)} ms</td>
              <td>{result.droppedPercent.toFixed(1)}%</td>
              <td><span className={result.smooth ? "smooth" : "limited"}>{result.smooth ? "Smooth" : "Limited"}</span></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="anime4k-benchmark-actions">
          {benchmark.recommendation && <button type="button" className="anime4k-benchmark-apply" onClick={() => { changeMode(benchmark.recommendation!); setBenchmark({ phase: "idle", currentIndex: 0, progress: 0, stage: "", results: [] }); }}>Use Mode {modeLabel(benchmark.recommendation)}</button>}
          <button type="button" onClick={() => void startBenchmark()}>Run again</button>
        </div>
      </>}

      {benchmark.phase === "error" && <>
        <p role="alert">{benchmark.stage}</p>
        <div className="anime4k-benchmark-actions"><button type="button" onClick={() => void startBenchmark()}>Try again</button></div>
      </>}
    </section>}

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
