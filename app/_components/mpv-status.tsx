"use client";

import { useCallback, useEffect, useState } from "react";

export type MpvPlayback = { episodeId: string; animeId: string; episodeNumber: number | null; position: number; duration: number; watched: boolean; active: boolean; updatedAt: number };
export type MpvStatus = { mpv: boolean; anime4k: boolean; mode: string; active?: boolean; playback?: MpvPlayback };

const MPV_PREFERENCE_KEY = "anime-cloud-use-mpv";
export const MPV_PROGRESS_EVENT = "anime-cloud-mpv-progress";

function rememberPlayback(playback?: MpvPlayback) {
  if (!playback) return;
  localStorage.setItem(`anime-cloud-progress:${playback.episodeId}`, JSON.stringify(playback));
  window.dispatchEvent(new CustomEvent(MPV_PROGRESS_EVENT, { detail: playback }));
}

export function useMpvPlayer() {
  const [status, setStatus] = useState<MpvStatus | null>(null);
  const [enabled, setEnabled] = useState(() => typeof window !== "undefined" && localStorage.getItem(MPV_PREFERENCE_KEY) === "true");

  const refresh = useCallback(() => {
    return fetch("/api/player/mpv", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: MpvStatus) => {
        setStatus(data);
        rememberPlayback(data.playback);
        return data;
      })
      .catch(() => setStatus({ mpv: false, anime4k: false, mode: "A" }));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!status?.active) return;
    const timer = window.setInterval(() => { void refresh(); }, 2000);
    return () => window.clearInterval(timer);
  }, [refresh, status?.active]);

  const setMpvEnabled = useCallback((value: boolean) => {
    localStorage.setItem(MPV_PREFERENCE_KEY, String(value));
    setEnabled(value);
  }, []);

  const markActive = useCallback(() => setStatus((current) => current ? { ...current, active: true } : current), []);
  const stop = useCallback(async () => {
    const response = await fetch("/api/player/mpv", { method: "DELETE" }).catch(() => null);
    if (!response?.ok) return null;
    const data = await response.json() as MpvStatus & { stopped?: number };
    setStatus(data);
    rememberPlayback(data.playback);
    return data.stopped || 0;
  }, []);

  return { status, enabled, setEnabled: setMpvEnabled, markActive, stop };
}

export function MpvStopButton({ active, onStop }: { active: boolean; onStop: () => void }) {
  if (!active) return null;
  return <button className="mpv-stop-button" type="button" onClick={onStop}>■ Stop MPV</button>;
}

export function MpvSetupNote({ status, enabled, onEnabledChange }: { status: MpvStatus | null; enabled: boolean; onEnabledChange: (enabled: boolean) => void }) {
  const ready = status?.mpv && status.anime4k;
  return <aside className={`mpv-setup-note ${ready ? enabled ? "ready" : "disabled" : status ? "fallback" : "checking"}`}>
    <span className="mpv-setup-dot" aria-hidden="true" />
    <div>
      <strong>{ready ? enabled ? "MPV + Anime4K high-end selected" : "Browser player selected" : status ? "Browser player active" : "Checking local playback…"}</strong>
      <p>{ready ? enabled ? "Ctrl+1/2/3: A/B/C · Ctrl+4/5/6: A+A/B+B/C+A · Ctrl+0: off. Every change appears on screen." : "Episodes play on the website. Turn on MPV whenever you want native upscaling." : "Install MPV and the complete Anime4K high-end shader set to enable native upscaling; browser playback remains available."}</p>
    </div>
    {ready
      ? <button className="mpv-toggle" type="button" role="switch" aria-checked={enabled} onClick={() => onEnabledChange(!enabled)}>Use MPV: {enabled ? "On" : "Off"}</button>
      : status && <a href="https://github.com/bloc97/Anime4K/blob/master/md/GLSL_Instructions_Windows_MPV.md" target="_blank" rel="noreferrer">Setup guide ↗</a>}
  </aside>;
}
