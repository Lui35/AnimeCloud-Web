"use client";

import { CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "./_components/site-header";
import { PageLoading } from "./_components/page-loading";

type Anime = {
  id: string;
  name: string;
  image?: string;
  status?: string;
  year?: string;
  day?: string;
  epName?: string;
  keywords?: string;
};

type Episode = {
  id: string;
  name: string;
  image?: string;
  filler?: boolean;
};

type AnimeDetail = Anime & {
  story?: string;
  genres?: string;
  age?: string;
  rank?: string;
  episodes: Episode[];
  related: Anime[];
};

type HomePayload = {
  featured: Anime[];
  newAnime: Anime[];
  latest: Anime[];
  schedule: Anime[];
  source?: "live" | "fallback";
};

type User = { username: string; email: string; profilePicture?: string; subscribe?: string };

const EMPTY_HOME: HomePayload = { featured: [], newAnime: [], latest: [], schedule: [] };

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const todayName = days[new Date().getDay()];

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("");
}

function posterStyle(anime: Anime, index: number): CSSProperties {
  return anime.image
    ? { backgroundImage: `linear-gradient(180deg, transparent 20%, rgba(8,5,12,.92) 100%), url("${anime.image}")` }
    : { "--poster-hue": `${(index * 47 + 266) % 360}` } as CSSProperties;
}

function PosterCard({ anime, index, onOpen }: { anime: Anime; index: number; onOpen: (anime: Anime) => void }) {
  return (
    <button className="poster-card" style={posterStyle(anime, index)} onClick={() => onOpen(anime)} aria-label={`Open ${anime.name}`}>
      <span className="poster-initials" aria-hidden="true">{initials(anime.name)}</span>
      <span className="poster-copy">
        <strong>{anime.name}</strong>
        <span>{anime.year || "Anime"} · {anime.status || "Now streaming"}</span>
      </span>
      <span className="poster-play" aria-hidden="true">▶</span>
    </button>
  );
}

export default function Home() {
  const router = useRouter();
  const [home, setHome] = useState<HomePayload>(EMPTY_HOME);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Anime[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<AnimeDetail | null>(null);
  const [library, setLibrary] = useState<Anime[]>([]);
  const [notice, setNotice] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup" | "recover">("login");
  const [username, setUsername] = useState("");
  const [aniList, setAniList] = useState<{ connected: boolean; viewer?: { name: string } | null }>({ connected: false });
  const [player, setPlayer] = useState<{ episode: Episode; anime: AnimeDetail; url: string; episodeNumber: number } | null>(null);
  const progressSaveAt = useRef(0);
  const homeAniListSynced = useRef<Set<string>>(new Set());
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [recommendPrompt, setRecommendPrompt] = useState("");
  const [recommendations, setRecommendations] = useState<Anime[]>([]);
  const [recommendBusy, setRecommendBusy] = useState(false);

  useEffect(() => {
    const homeLoadStarted = Date.now();
    const saved = localStorage.getItem("anime-cloud-library");
    if (saved) {
      try { const parsed = JSON.parse(saved); queueMicrotask(() => setLibrary(parsed)); } catch { /* ignore corrupt local state */ }
    }
    fetch("/api/home", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Home data is unavailable")))
      .then((data: HomePayload) => setHome(data))
      .catch(() => setLoadError("Anime Cloud could not load the home feed."))
      .finally(() => window.setTimeout(() => setLoading(false), Math.max(0, 350 - (Date.now() - homeLoadStarted))));
    fetch("/api/me").then((response) => response.json()).then((data: { user: User | null }) => { setUser(data.user); if (data.user) { loadRemoteLibrary(); refreshAniList(); } }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!query.trim()) return;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/catalog?q=${encodeURIComponent(query)}`);
        const data = await response.json() as { result?: Anime[] };
        setResults(data.result || []);
      } catch {
        const pool = [...home.featured, ...home.newAnime, ...home.latest, ...home.schedule];
        setResults(pool.filter((anime) => anime.name.toLowerCase().includes(query.toLowerCase())));
      } finally { setSearching(false); }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, home]);

  const hero = home.featured[0];
  const scheduledToday = useMemo(() => home.schedule.filter((anime) => anime.day === todayName), [home.schedule]);

  async function openAnime(anime: Anime) {
    setSearchOpen(false);
    const query = new URLSearchParams({ name: anime.name, image: anime.image || "", year: anime.year || "", status: anime.status || "" });
    router.push(`/anime/${encodeURIComponent(anime.id)}?${query}`);
  }

  async function loadRemoteLibrary() {
    try {
      const response = await fetch("/api/library"); if (!response.ok) return;
      const data = await response.json() as { result: { animeId: string; name: string; image: string; year: string }[] };
      const remote = data.result.map((item) => ({ id: item.animeId, name: item.name || `Anime ${item.animeId}`, image: item.image, year: item.year }));
      setLibrary((current) => { const merged = [...current]; remote.forEach((item) => { if (!merged.some((entry) => entry.id === item.id)) merged.push(item); }); localStorage.setItem("anime-cloud-library", JSON.stringify(merged)); return merged; });
    } catch { /* local library remains available offline */ }
  }

  async function refreshAniList() {
    try { const data = await fetch("/api/anilist/status").then((response) => response.json()); setAniList(data); } catch { /* optional integration */ }
  }

  function toggleLibrary(anime: Anime) {
    const exists = library.some((item) => item.id === anime.id);
    const next = exists ? library.filter((item) => item.id !== anime.id) : [...library, anime];
    setLibrary(next);
    localStorage.setItem("anime-cloud-library", JSON.stringify(next));
    if (user) fetch(`/api/library/${encodeURIComponent(anime.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: anime.name, image: anime.image || "", year: anime.year || "", category: 0, deleted: exists }) }).catch(() => undefined);
    setNotice(exists ? "Removed from My List" : "Added to My List");
    window.setTimeout(() => setNotice(""), 1800);
  }

  async function playEpisode(episode: Episode) {
    setNotice("Preparing secure playback…");
    try {
      const response = await fetch(`/api/episodes/${encodeURIComponent(episode.id)}/source`, { method: "POST" });
      const data = await response.json() as { url?: string; message?: string };
      if (!response.ok || !data.url) throw new Error(data.message || "Playback is not available yet.");
      const episodeNumber = Number(episode.name.match(/\d+/)?.[0] || 0);
      if (!selected) throw new Error("Anime details are unavailable.");
      setPlayer({ episode, anime: selected, url: data.url, episodeNumber });
      setSelected(null);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Playback is not available yet.");
    }
    window.setTimeout(() => setNotice(""), 3200);
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const endpoint = authMode === "signup" ? "/api/auth/signup" : authMode === "recover" ? "/api/auth/recover" : "/api/auth/login";
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, email, password }) });
      const data = await response.json() as { user?: User; message?: string };
      if (!response.ok) throw new Error(data.message || "Unable to continue.");
      if (authMode !== "login") { setAuthMessage(data.message || "Done."); setAuthMode("login"); return; }
      if (!data.user) throw new Error("Unable to sign in.");
      setUser(data.user);
      setPassword("");
      setAuthMessage("Signed in securely.");
      await Promise.allSettled([loadRemoteLibrary(), refreshAniList()]);
    } catch (error) { setAuthMessage(error instanceof Error ? error.message : "Unable to sign in."); }
    finally { setAuthBusy(false); }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setAuthMessage("");
  }

  async function syncService(service: "legacy" | "anilist") {
    setAuthMessage(`Syncing ${service === "legacy" ? "Anime Cloud" : "AniList"}…`);
    try {
      const response = await fetch(service === "legacy" ? "/api/library/sync" : "/api/anilist/sync", { method: "POST" });
      const data = await response.json() as { message?: string; imported?: number; uploaded?: number | boolean; firstSync?: boolean };
      if (!response.ok) throw new Error(data.message || "Sync failed.");
      setAuthMessage(`${data.firstSync ? "Safe first import" : "Sync complete"}: ${data.imported || 0} imported, ${Number(data.uploaded) || 0} uploaded.`);
      await loadRemoteLibrary();
    } catch (error) { setAuthMessage(error instanceof Error ? error.message : "Sync failed."); }
  }

  async function recommend(event: FormEvent) {
    event.preventDefault(); setRecommendBusy(true);
    try { const response = await fetch("/api/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: recommendPrompt }) }); const data = await response.json() as { result?: Anime[]; message?: string }; if (!response.ok) throw new Error(data.message); setRecommendations(data.result || []); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Recommendations unavailable."); }
    finally { setRecommendBusy(false); }
  }

  function saveProgress(video: HTMLVideoElement, force = false) {
    if (!player || (!force && Date.now() - progressSaveAt.current < 5000) || video.currentTime < 3) return;
    progressSaveAt.current = Date.now();
    const watched = video.duration > 0 && video.currentTime / video.duration >= .9;
    const value = { position: watched ? 0 : video.currentTime, duration: video.duration || 0, updatedAt: new Date().toISOString() };
    localStorage.setItem(`anime-cloud-progress:${player.episode.id}`, JSON.stringify(value));
    if (user) void fetch(`/api/episodes/${encodeURIComponent(player.episode.id)}/progress`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ animeId: player.anime.id, episodeNumber: player.episodeNumber, position: video.currentTime, duration: video.duration || 0, watched }) }).then(async (response) => {
      if (!watched || !response.ok || homeAniListSynced.current.has(player.episode.id)) return;
      homeAniListSynced.current.add(player.episode.id);
      fetch("/api/library/sync", { method: "POST" }).catch(() => undefined);
      const syncResponse = await fetch("/api/anilist/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ animeId: player.anime.id, animeName: player.anime.name }) }).catch(() => null);
      if (syncResponse?.ok) setNotice("Episode completed and AniList progress updated automatically.");
      else {
        homeAniListSynced.current.delete(player.episode.id);
        if (syncResponse && syncResponse.status !== 400) setNotice("Episode completed, but AniList could not be updated.");
      }
    }).catch(() => undefined);
  }

  if (loading) return <main><SiteHeader active="home" /><PageLoading label="Loading Home" /></main>;
  if (loadError || !hero) return <main><SiteHeader active="home" /><section className="route-loading" role="alert"><strong>Unable to load Home</strong><small>{loadError || "The live catalog returned no featured titles."}</small><button className="primary-button" onClick={() => window.location.reload()}>Try again</button></section></main>;

  return (
    <main>
      <SiteHeader active="home" onSearch={() => setSearchOpen(true)} />

      <section className="hero" id="top" style={posterStyle(hero, 0)}>
        <div className="hero-orb" aria-hidden="true" />
        <div className="hero-content">
          <span className="eyebrow"><i /> Featured this week</span>
          <h1>{hero.name}</h1>
          <p className="hero-meta"><span>★ 8.8</span> {hero.year || "2025"} · {hero.status || "Streaming"} · Action / Fantasy</p>
          <p className="hero-description">A new season. A higher rank. Step back into a world where every shadow can become an ally.</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => openAnime(hero)}><span>▶</span> Watch now</button>
            <button className="secondary-button" onClick={() => toggleLibrary(hero)}>{library.some((item) => item.id === hero.id) ? "✓ In My List" : "+ My List"}</button>
          </div>
        </div>
        <div className="hero-title-art" aria-hidden="true"><span>{initials(hero.name)}</span><small>ARISE</small></div>
        <div className="hero-fade" />
      </section>

      <div className="content-shell">
        <section id="trending" className="content-section">
          <div className="section-heading"><div><span className="section-kicker">Most watched</span><h2>Trending now</h2></div><button onClick={() => router.push("/discover")}>Browse all <span>→</span></button></div>
          <div className="poster-grid">
            {home.featured.slice(0, 6).map((anime, index) => <PosterCard key={`${anime.id}-${index}`} anime={anime} index={index} onOpen={openAnime} />)}
          </div>
        </section>

        <section className="content-section newly-added-section">
          <div className="section-heading"><div><span className="section-kicker">Just added</span><h2>Newly added anime</h2></div><button onClick={() => router.push("/discover")}>Explore catalog <span>→</span></button></div>
          <div className="poster-grid">{home.newAnime.slice(0, 6).map((anime, index) => <PosterCard key={`new-${anime.id}-${index}`} anime={anime} index={index + 6} onOpen={openAnime} />)}</div>
        </section>

        <section className="content-section latest-section">
          <div className="section-heading"><div><span className="section-kicker">Fresh arrivals</span><h2>Newly added episodes</h2></div><span className="live-pill"><i /> Updated live</span></div>
          <div className="episode-grid">
            {home.latest.slice(0, 4).map((anime, index) => (
              <button key={`${anime.id}-${index}`} className="episode-card" onClick={() => openAnime(anime)}>
                <span className="episode-thumb" style={posterStyle(anime, index + 8)}><b>▶</b><small>{anime.epName || "New episode"}</small></span>
                <span className="episode-copy"><strong>{anime.name}</strong><span>{anime.epName || "New episode"}</span><small>{anime.year || "Recently added"}</small></span>
              </button>
            ))}
          </div>
        </section>

        <section id="schedule" className="content-section schedule-section">
          <div className="schedule-intro"><span className="section-kicker">Release calendar</span><h2>Your week,<br /><em>sorted.</em></h2><p>Stay in sync with every new episode. Times update automatically from the Anime Cloud catalog.</p><button className="secondary-button" onClick={() => setRecommendOpen(true)}>◇ Find my next anime</button></div>
          <div className="schedule-list">
            {days.map((day) => {
              const entries = home.schedule.filter((anime) => anime.day === day).slice(0, 2);
              return (
                <div className={`schedule-day ${day === todayName ? "today" : ""}`} key={day}>
                  <span className="day-label">{day.slice(0, 3)}{day === todayName && <small>Today</small>}</span>
                  <div>{entries.length ? entries.map((anime) => <button onClick={() => openAnime(anime)} key={anime.id}><strong>{anime.name}</strong><span>{anime.status || "New episode"}</span></button>) : <span className="quiet">No releases yet</span>}</div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <footer><a className="brand" href="#top"><span className="brand-mark">AC</span><span>Anime Cloud</span></a><p>Your library. Your pace. Always in sync.</p><span>Powered by the recovered Anime Cloud catalog</span></footer>

      {searchOpen && <div className="overlay" role="dialog" aria-modal="true" aria-label="Search anime" onMouseDown={(event) => event.currentTarget === event.target && setSearchOpen(false)}>
        <div className="search-panel">
          <div className="search-input"><span>⌕</span><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); if (!event.target.value.trim()) setResults([]); }} placeholder="Search 2,500+ anime…" aria-label="Search catalog" /><button onClick={() => setSearchOpen(false)}>Esc</button></div>
          <p>{searching ? "Searching the catalog…" : query ? `${results.length} results` : "Try a title, genre, or year"}</p>
          <div className="search-results">{results.slice(0, 10).map((anime, index) => <button onClick={() => openAnime(anime)} key={`${anime.id}-${index}`}><span className="result-art" style={posterStyle(anime, index)}>{initials(anime.name)}</span><span><strong>{anime.name}</strong><small>{anime.year || "Anime"} · {anime.status || "Available"}</small></span><b>→</b></button>)}</div>
        </div>
      </div>}

      {accountOpen && <div className="overlay account-overlay" role="dialog" aria-modal="true" aria-label="Anime Cloud account" onMouseDown={(event) => event.currentTarget === event.target && setAccountOpen(false)}>
        <div className="account-panel"><button className="detail-close" onClick={() => setAccountOpen(false)} aria-label="Close account">×</button>
          {user ? <div className="account-signed-in"><span className="account-avatar">{initials(user.username)}</span><span className="section-kicker">Anime Cloud account</span><h2>Welcome back,<br />{user.username}.</h2><p>{user.email}</p><div className="account-security"><strong>Secure session</strong><span>Your legacy account token stays encrypted in an HTTP-only cookie and is never exposed to browser storage.</span></div><div className="integration-row"><div><strong>Legacy cloud</strong><span>Compatible library backup</span></div><button onClick={() => syncService("legacy")}>Sync</button></div><div className="integration-row"><div><strong>AniList</strong><span>{aniList.connected ? `Connected as ${aniList.viewer?.name || "viewer"}` : "Not connected"}</span></div>{aniList.connected ? <button onClick={() => syncService("anilist")}>Sync</button> : <a href="/api/anilist/connect">Connect</a>}</div>{authMessage && <div className="auth-message" role="status">{authMessage}</div>}<button className="secondary-button" onClick={logout}>Sign out</button></div>
          : <form onSubmit={submitAuth}><span className="section-kicker">Legacy account</span><h2>{authMode === "signup" ? <>Join your cloud.</> : authMode === "recover" ? <>Find your way back.</> : <>Keep your cloud<br />within reach.</>}</h2><p>{authMode === "recover" ? "We’ll ask the existing account service to send recovery instructions." : "Your credentials pass through this server once and are never stored."}</p><div className="auth-tabs"><button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>Sign in</button><button type="button" className={authMode === "signup" ? "active" : ""} onClick={() => setAuthMode("signup")}>Create account</button><button type="button" className={authMode === "recover" ? "active" : ""} onClick={() => setAuthMode("recover")}>Recover</button></div>{authMode === "signup" && <label>Username<input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Your display name" /></label>}<label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>{authMode !== "recover" && <label>Password<input type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" /></label>}{authMessage && <div className="auth-message" role="status">{authMessage}</div>}<button className="primary-button account-submit" disabled={authBusy}>{authBusy ? "Please wait…" : authMode === "signup" ? "Create account" : authMode === "recover" ? "Send recovery" : "Sign in securely"}</button></form>}
        </div>
      </div>}

      {recommendOpen && <div className="overlay recommendation-overlay" role="dialog" aria-modal="true" aria-label="Anime recommendations" onMouseDown={(event) => event.currentTarget === event.target && setRecommendOpen(false)}><div className="recommendation-panel"><button className="detail-close" onClick={() => setRecommendOpen(false)} aria-label="Close recommendations">×</button><span className="section-kicker">Grounded discovery</span><h2>What are you in the mood for?</h2><form onSubmit={recommend}><input value={recommendPrompt} onChange={(event) => setRecommendPrompt(event.target.value)} placeholder="A clever mystery with a slow burn…" aria-label="Describe an anime" /><button className="primary-button" disabled={recommendBusy}>{recommendBusy ? "Searching…" : "Recommend"}</button></form><div className="recommend-grid">{recommendations.map((anime, index) => <PosterCard key={anime.id} anime={anime} index={index} onOpen={(item) => { setRecommendOpen(false); openAnime(item); }} />)}</div>{!recommendations.length && <p>Recommendations are validated against the live Anime Cloud catalog, so every result is available in the app.</p>}</div></div>}

      {selected && <div className="overlay detail-overlay" role="dialog" aria-modal="true" aria-label={`${selected.name} details`} onMouseDown={(event) => event.currentTarget === event.target && setSelected(null)}>
        <div className="detail-panel">
          <button className="detail-close" onClick={() => setSelected(null)} aria-label="Close details">×</button>
          <div className="detail-hero" style={posterStyle(selected, 2)}><span className="detail-monogram">{initials(selected.name)}</span></div>
          <div className="detail-content"><span className="section-kicker">{selected.status || "Anime series"}</span><h2>{selected.name}</h2><p className="detail-meta">{selected.year || "—"} · {selected.genres || "Action / Adventure"} {selected.rank ? `· Rank #${selected.rank}` : ""}</p><p className="detail-story">{selected.story || "Story details are loading from the Anime Cloud catalog."}</p>
            <div className="hero-actions"><button className="primary-button" disabled={!selected.episodes.length} onClick={() => selected.episodes[0] && playEpisode(selected.episodes[0])}>▶ {selected.episodes.length ? "Play latest" : "Coming soon"}</button><button className="secondary-button" onClick={() => toggleLibrary(selected)}>{library.some((item) => item.id === selected.id) ? "✓ In My List" : "+ My List"}</button></div>
            <div className="episode-list-heading"><h3>Episodes</h3><span>{selected.episodes.length} available</span></div>
            <div className="episode-list">{selected.episodes.slice(0, 18).map((episode, index) => <button onClick={() => playEpisode(episode)} key={episode.id}><span>{String(selected.episodes.length - index).padStart(2, "0")}</span><strong>{episode.name}</strong>{episode.filler && <small>Filler</small>}<b>▶</b></button>)}</div>
          </div>
        </div>
      </div>}

      {player && <div className="overlay player-overlay" role="dialog" aria-modal="true" aria-label={`Playing ${player.episode.name}`}><div className="player-shell"><div className="player-heading"><div><span className="section-kicker">Now playing</span><h2>{player.anime.name}</h2><p>{player.episode.name}</p></div><button onClick={() => setPlayer(null)} aria-label="Close player">×</button></div><video src={player.url} controls autoPlay playsInline onLoadedMetadata={(event) => { const saved = localStorage.getItem(`anime-cloud-progress:${player.episode.id}`); if (saved) { try { const value = JSON.parse(saved) as { position?: number }; if (value.position && value.position > 3) event.currentTarget.currentTime = value.position; } catch { /* ignore */ } } }} onTimeUpdate={(event) => saveProgress(event.currentTarget)} onPause={(event) => saveProgress(event.currentTarget, true)} onEnded={(event) => saveProgress(event.currentTarget, true)} /><div className="player-note"><span>Progress saves automatically</span><span>Picture in Picture and fullscreen are available from the player controls.</span></div></div></div>}

      {notice && <div className="toast" role="status">{notice}</div>}
      {scheduledToday.length > 0 && <div className="today-indicator" aria-hidden="true">{scheduledToday.length} release{scheduledToday.length > 1 ? "s" : ""} today</div>}
    </main>
  );
}
