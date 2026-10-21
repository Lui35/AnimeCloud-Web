"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { AnimeDetail, Episode, PosterLink, posterStyle } from "../../_components/catalog-ui";
import { SiteHeader } from "../../_components/site-header";
import { MPV_PROGRESS_EVENT, MpvSetupNote, MpvStopButton, useMpvPlayer, type MpvPlayback } from "../../_components/mpv-status";
import { Anime4KPlayer } from "../../_components/anime4k-player";
import { useSearchParams } from "next/navigation";

type EpisodeProgress = { episodeId: string; position: number; duration: number; watched: boolean };
function formatTime(seconds: number) { const value = Math.max(0, Math.floor(seconds)); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`; }
function episodeNumber(name: string) { return name.match(/\d+/)?.[0] || "SP"; }

export default function AnimePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const [anime, setAnime] = useState<AnimeDetail | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [player, setPlayer] = useState<{ episode: Episode; url: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Map<string, EpisodeProgress>>(new Map());
  const [libraryCategory, setLibraryCategory] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [episodeMenu, setEpisodeMenu] = useState<{ episode: Episode; x: number; y: number } | null>(null);
  const mpv = useMpvPlayer();
  const saveAt = useRef(0);
  const aniListSynced = useRef<Set<string>>(new Set());
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => { fetch(`/api/anime/${encodeURIComponent(id)}`, { cache: "no-store" }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Anime unavailable"); const name = searchParams.get("name"); return { ...data, name: name || data.name, image: searchParams.get("image") || data.image, year: searchParams.get("year") || data.year, status: searchParams.get("status") || data.status }; }).then(setAnime).catch((reason) => setError(reason.message)); fetch("/api/library", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => { if (!data) return; setSignedIn(true); if (data.progress) { setWatched(new Set(data.progress.filter((item: EpisodeProgress) => item.watched).map((item: EpisodeProgress) => item.episodeId))); setProgress(new Map(data.progress.map((item: EpisodeProgress) => [item.episodeId, item]))); } const saved = data.result?.find((item: { animeId: string }) => item.animeId === id); setLibraryCategory(saved ? saved.category : null); }).catch(() => undefined); }, [id, searchParams]);
  const episodes = useMemo(() => anime?.episodes.filter((episode) => episode.name.toLowerCase().includes(filter.toLowerCase())) || [], [anime, filter]);
  useEffect(() => { if (!episodeMenu) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape") setEpisodeMenu(null); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [episodeMenu]);
  useEffect(() => {
    const update = (event: Event) => {
      const saved = (event as CustomEvent<MpvPlayback>).detail;
      if (saved.animeId !== id) return;
      const value = { episodeId: saved.episodeId, position: saved.position, duration: saved.duration, watched: saved.watched };
      setProgress((current) => new Map(current).set(saved.episodeId, value));
      setWatched((current) => { const next = new Set(current); if (saved.watched) next.add(saved.episodeId); else next.delete(saved.episodeId); return next; });
    };
    window.addEventListener(MPV_PROGRESS_EVENT, update);
    return () => window.removeEventListener(MPV_PROGRESS_EVENT, update);
  }, [id]);

  async function play(episode: Episode) {
    const saved = progress.get(episode.id);
    if (mpv.enabled && mpv.status?.mpv && mpv.status.anime4k) {
      setNotice("Starting MPV with Anime4K…");
      const native = await fetch("/api/player/mpv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ episodeId: episode.id, animeId: id, episodeNumber: Number(episode.name.match(/\d+/)?.[0] || 0), title: `${anime?.name || "Anime"} · ${episode.name}`, position: saved && !saved.watched ? saved.position : 0 }) }).catch(() => null);
      if (native?.ok) {
        mpv.markActive();
        setNotice("Opened in MPV with Mode A. Use Ctrl+1–6 to switch modes or Ctrl+0 to disable Anime4K.");
        window.setTimeout(() => setNotice(""), 4200);
        return;
      }
    }

    setNotice("Preparing browser playback…");
    const response = await fetch(`/api/episodes/${encodeURIComponent(episode.id)}/source`, { method: "POST" });
    const data = await response.json();
    if (!response.ok || !data.url) { setNotice(data.message || "Playback unavailable"); return; }
    setPlayer({ episode, url: data.url });
    setNotice(saved && !saved.watched && saved.position > 3 ? `Resuming from ${formatTime(saved.position)}…` : "");
  }
  async function syncAniListProgress() {
    if (!anime) return null;
    return fetch("/api/anilist/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ animeId: id, animeName: anime.name }) }).catch(() => null);
  }
  async function save(video: HTMLVideoElement, force = false, ended = false) {
    if (!player || (!force && Date.now() - saveAt.current < 5000) || video.currentTime < 3) return;
    saveAt.current = Date.now();
    const watched = ended || (video.duration > 0 && video.currentTime / video.duration >= .9);
    const value = { episodeId: player.episode.id, position: watched ? 0 : video.currentTime, duration: video.duration || 0, watched };
    localStorage.setItem(`anime-cloud-progress:${player.episode.id}`, JSON.stringify(value));
    setProgress((current) => new Map(current).set(player.episode.id, value));
    if (!signedIn) return;
    const response = await fetch(`/api/episodes/${encodeURIComponent(player.episode.id)}/progress`, { method: "PUT", keepalive: force, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ animeId: id, episodeNumber: Number(player.episode.name.match(/\d+/)?.[0] || 0), position: video.currentTime, duration: video.duration || 0, watched }) }).catch(() => null);
    if (watched && response?.ok) {
      setWatched((current) => new Set(current).add(player.episode.id));
      fetch("/api/library/sync", { method: "POST" }).catch(() => undefined);
      if (!aniListSynced.current.has(player.episode.id)) {
        aniListSynced.current.add(player.episode.id);
        void syncAniListProgress().then((syncResponse) => {
          if (syncResponse?.ok) setNotice("Episode completed and AniList progress updated automatically.");
          else {
            aniListSynced.current.delete(player.episode.id);
            if (syncResponse && syncResponse.status !== 400) setNotice("Episode completed, but AniList could not be updated.");
          }
        });
      }
    }
  }
  async function saveToLibrary(category: number | null) {
    if (!anime) return;
    if (!signedIn) { setNotice("Sign in to save this anime to My List."); return; }
    const response = await fetch(`/api/library/${encodeURIComponent(id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: anime.name, image: anime.image || "", year: anime.year || "", category: category ?? 0, deleted: category === null }) });
    if (!response.ok) { setNotice("Unable to update My List."); return; }
    setLibraryCategory(category);
    setNotice(category === null ? "Removed from My List." : `Saved as ${["Favorite", "Completed", "Watch later", "Watching now"][category]}.`);
  }
  async function setEpisodeWatched(episode: Episode, isWatched: boolean) {
    setEpisodeMenu(null);
    const value = { episodeId: episode.id, position: 0, duration: progress.get(episode.id)?.duration || 0, watched: isWatched };
    localStorage.setItem(`anime-cloud-progress:${episode.id}`, JSON.stringify(value));
    setProgress((current) => new Map(current).set(episode.id, value));
    setWatched((current) => { const next = new Set(current); if (isWatched) next.add(episode.id); else next.delete(episode.id); return next; });
    if (!isWatched) aniListSynced.current.delete(episode.id);
    if (!signedIn) { setNotice(`Marked ${isWatched ? "watched" : "unwatched"} on this device.`); return; }
    const response = await fetch(`/api/episodes/${encodeURIComponent(episode.id)}/progress`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ animeId: id, episodeNumber: Number(episode.name.match(/\d+/)?.[0] || 0), position: 0, duration: value.duration, watched: isWatched }) }).catch(() => null);
    if (!response?.ok) { setNotice("The episode changed locally, but cloud sync failed."); return; }
    setNotice(`Episode marked ${isWatched ? "watched" : "unwatched"}. Syncing…`);
    const [, aniListResult] = await Promise.allSettled([
      fetch("/api/library/sync", { method: "POST" }),
      syncAniListProgress(),
    ]);
    if (aniListResult.status === "fulfilled" && aniListResult.value?.ok) { if (isWatched) aniListSynced.current.add(episode.id); setNotice(`Episode marked ${isWatched ? "watched" : "unwatched"} and synced to AniList.`); }
    else if (aniListResult.status === "fulfilled" && aniListResult.value && aniListResult.value.status !== 400) setNotice(`Episode marked ${isWatched ? "watched" : "unwatched"}, but AniList sync failed.`);
    else setNotice(`Episode marked ${isWatched ? "watched" : "unwatched"}.`);
  }

  return <main><SiteHeader />
    {error && <div className="page-message">{error}</div>}
    {!anime ? <div className="page-message">Loading anime…</div> : <>
      <section className="anime-page-hero"><div className="anime-page-poster" style={posterStyle(anime)} /><div><span className="section-kicker">Anime details</span><h1>{anime.name}</h1><p className="hero-meta"><span>★ {anime.rank || "—"}</span> {anime.year || ""} · {anime.status || "Available"} · {anime.age || "All ages"}</p><p>{anime.story || "No synopsis is available."}</p><p className="genre-line">{anime.genres}</p><div className="anime-actions">{anime.episodes[0] && <button className="primary-button" onClick={() => play(anime.episodes[0])}>▶ Play latest</button>}<div className="list-statuses" aria-label="Save anime to My List">{["Favorite", "Completed", "Watch later", "Watching now"].map((label, category) => <button className={libraryCategory === category ? "active" : ""} onClick={() => saveToLibrary(category)} key={label}>{libraryCategory === category ? "✓ " : "+ "}{label}</button>)}{libraryCategory !== null && <button onClick={() => saveToLibrary(null)}>Remove</button>}</div></div></div></section>
      {!!anime.related.length && <section className="content-shell related-series"><div className="section-heading"><div><span className="section-kicker">Connected stories</span><h2>Related series</h2><p>Open any related title on its own full page.</p></div></div><div className="poster-grid related-grid">{anime.related.slice(0, 6).map((item, index) => <PosterLink anime={item} index={index} key={item.id} />)}</div></section>}
      <section className="content-shell anime-episodes"><MpvSetupNote status={mpv.status} enabled={mpv.enabled} onEnabledChange={mpv.setEnabled} /><div className="section-heading"><div><span className="section-kicker">Complete archive</span><h2>Episodes</h2></div><span>{episodes.length} available</span></div>
        <div className="episode-tools"><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Find an episode…" aria-label="Find an episode" /><span>Showing all {episodes.length} episodes</span></div>
        <div className="full-episode-list">{episodes.map((episode, index) => { const saved = progress.get(episode.id); return <button className={watched.has(episode.id) ? "watched" : ""} onClick={() => play(episode)} onContextMenu={(event) => { event.preventDefault(); setEpisodeMenu({ episode, x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 110) }); }} title="Right-click to change watched status" key={episode.id}><span className="episode-number">{episodeNumber(episode.name)}</span><span className="episode-list-thumb" style={posterStyle({ id: episode.id, name: episode.name, image: episode.image }, index)} /><strong>{episode.name}</strong><span className="episode-badges">{watched.has(episode.id) ? <small className="watched-badge">✓ Watched</small> : saved && saved.position > 3 && <small className="resume-badge">Resume {formatTime(saved.position)}</small>}<small className={episode.filler ? "filler-badge" : "canon-badge"}>{episode.filler ? "Filler" : "Canon"}</small></span><b>▶</b></button>; })}</div>
      </section>
    </>}
    {notice && <div className="toast" role="status">{notice}</div>}
    <MpvStopButton active={mpv.enabled && Boolean(mpv.status?.mpv)} onStop={() => { void mpv.stop().then((stopped) => setNotice(stopped === null ? "MPV could not be stopped." : stopped ? "MPV stopped." : "No MPV process was running.")); }} />
    {episodeMenu && <><button className="context-dismiss" aria-label="Close episode menu" onClick={() => setEpisodeMenu(null)} /><div className="episode-context-menu" role="menu" aria-label={`Episode options for ${episodeMenu.episode.name}`} style={{ left: episodeMenu.x, top: episodeMenu.y }}><strong>{episodeMenu.episode.name}</strong><button role="menuitem" onClick={() => setEpisodeWatched(episodeMenu.episode, !watched.has(episodeMenu.episode.id))}>{watched.has(episodeMenu.episode.id) ? "○ Mark as unwatched" : "✓ Mark as watched"}</button></div></>}
    {player && <div className="overlay player-overlay" role="dialog" aria-modal="true" aria-label={`Playing ${player.episode.name}`}><div className="player-shell"><div className="player-heading"><div><span className="section-kicker">Now playing</span><h2>{anime?.name}</h2><p>{player.episode.name}</p></div><button onClick={() => { if (videoRef.current) void save(videoRef.current, true); setPlayer(null); }} aria-label="Close player">×</button></div><Anime4KPlayer ref={videoRef} src={player.url} episodeId={player.episode.id} autoPlay playsInline onLoadedMetadata={(video) => { const remote = progress.get(player.episode.id); let position = remote && !remote.watched ? remote.position : 0; const local = localStorage.getItem(`anime-cloud-progress:${player.episode.id}`); if (local) try { const saved = JSON.parse(local) as EpisodeProgress; if (!saved.watched && saved.position > position) position = saved.position; } catch { /* ignore invalid local progress */ } if (position > 3 && position < video.duration * .95) video.currentTime = position; }} onTimeUpdate={(video) => save(video)} onPause={(video) => save(video, true)} onEnded={(video) => save(video, true, true)} /><div className="player-note"><span>Progress saves every few seconds</span><span>Anime4K modes run on your GPU and are remembered on this device.</span></div></div></div>}
  </main>;
}
