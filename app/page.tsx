"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";

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
  latest: Anime[];
  schedule: Anime[];
  source?: "live" | "fallback";
};

const FALLBACK: HomePayload = {
  source: "fallback",
  featured: [
    { id: "2571", name: "Solo Leveling Season 2", year: "2025", status: "Completed", keywords: "action fantasy adventure" },
    { id: "2", name: "Frieren: Beyond Journey's End", year: "2023", status: "Completed", keywords: "fantasy adventure drama" },
    { id: "3", name: "The Apothecary Diaries", year: "2023", status: "Ongoing", keywords: "mystery drama historical" },
    { id: "4", name: "Dandadan", year: "2024", status: "Ongoing", keywords: "supernatural action comedy" },
    { id: "5", name: "One Piece", year: "1999", status: "Ongoing", keywords: "adventure action" },
    { id: "6", name: "Wind Breaker", year: "2024", status: "Ongoing", keywords: "action school" },
  ],
  latest: [
    { id: "11", name: "Solo Leveling Season 2", epName: "Episode 13", year: "Today" },
    { id: "12", name: "The Apothecary Diaries", epName: "Episode 24", year: "Today" },
    { id: "13", name: "One Piece", epName: "Episode 1138", year: "Yesterday" },
    { id: "14", name: "Dandadan", epName: "Episode 12", year: "Yesterday" },
  ],
  schedule: [
    { id: "21", name: "One Piece", day: "Sunday" },
    { id: "22", name: "Summer Pockets", day: "Monday" },
    { id: "23", name: "The Shiunji Family Children", day: "Tuesday" },
    { id: "24", name: "The Beginning After the End", day: "Wednesday" },
    { id: "25", name: "Wind Breaker", day: "Thursday" },
    { id: "26", name: "Fire Force", day: "Friday" },
    { id: "27", name: "The Apothecary Diaries", day: "Saturday" },
  ],
};

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
  const [home, setHome] = useState<HomePayload>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Anime[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<AnimeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [library, setLibrary] = useState<Anime[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("anime-cloud-library");
    if (saved) {
      try { setLibrary(JSON.parse(saved)); } catch { /* ignore corrupt local state */ }
    }
    fetch("/api/home")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: HomePayload) => setHome(data))
      .catch(() => setHome(FALLBACK))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/catalog?q=${encodeURIComponent(query)}`);
        const data = await response.json() as { result?: Anime[] };
        setResults(data.result || []);
      } catch {
        const pool = [...home.featured, ...home.latest, ...home.schedule];
        setResults(pool.filter((anime) => anime.name.toLowerCase().includes(query.toLowerCase())));
      } finally { setSearching(false); }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, home]);

  const hero = home.featured[0] || FALLBACK.featured[0];
  const scheduledToday = useMemo(() => home.schedule.filter((anime) => anime.day === todayName), [home.schedule]);

  async function openAnime(anime: Anime) {
    setSearchOpen(false);
    setDetailLoading(true);
    setSelected({ ...anime, episodes: [], related: [] });
    try {
      const response = await fetch(`/api/anime/${encodeURIComponent(anime.id)}`);
      if (response.ok) setSelected({ ...anime, ...await response.json() });
    } finally { setDetailLoading(false); }
  }

  function toggleLibrary(anime: Anime) {
    const exists = library.some((item) => item.id === anime.id);
    const next = exists ? library.filter((item) => item.id !== anime.id) : [...library, anime];
    setLibrary(next);
    localStorage.setItem("anime-cloud-library", JSON.stringify(next));
    setNotice(exists ? "Removed from My List" : "Added to My List");
    window.setTimeout(() => setNotice(""), 1800);
  }

  async function playEpisode(episode: Episode) {
    setNotice("Preparing secure playback…");
    try {
      const response = await fetch(`/api/episodes/${encodeURIComponent(episode.id)}/source`, { method: "POST" });
      const data = await response.json() as { url?: string; message?: string };
      if (!response.ok || !data.url) throw new Error(data.message || "Playback is not available yet.");
      window.open(data.url, "_blank", "noopener,noreferrer");
      setNotice("Playback opened in a new tab");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Playback is not available yet.");
    }
    window.setTimeout(() => setNotice(""), 3200);
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Anime Cloud home"><span className="brand-mark">AC</span><span>Anime Cloud</span></a>
        <nav aria-label="Primary navigation">
          <a className="active" href="#top">Home</a>
          <a href="#trending">Discover</a>
          <a href="#schedule">Schedule</a>
        </nav>
        <div className="header-actions">
          <button className="icon-button" onClick={() => setSearchOpen(true)} aria-label="Search">⌕</button>
          <button className="library-button" onClick={() => setLibraryOpen(true)}>My List <span>{library.length}</span></button>
        </div>
      </header>

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
          <div className="section-heading"><div><span className="section-kicker">Most watched</span><h2>Trending now</h2></div><button onClick={() => setSearchOpen(true)}>Browse all <span>→</span></button></div>
          <div className={`poster-grid ${loading ? "is-loading" : ""}`}>
            {home.featured.slice(0, 6).map((anime, index) => <PosterCard key={`${anime.id}-${index}`} anime={anime} index={index} onOpen={openAnime} />)}
          </div>
        </section>

        <section className="content-section latest-section">
          <div className="section-heading"><div><span className="section-kicker">Fresh arrivals</span><h2>Latest episodes</h2></div><span className="live-pill"><i /> Updated live</span></div>
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
          <div className="schedule-intro"><span className="section-kicker">Release calendar</span><h2>Your week,<br /><em>sorted.</em></h2><p>Stay in sync with every new episode. Times update automatically from the Anime Cloud catalog.</p></div>
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
          <div className="search-input"><span>⌕</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search 2,500+ anime…" aria-label="Search catalog" /><button onClick={() => setSearchOpen(false)}>Esc</button></div>
          <p>{searching ? "Searching the catalog…" : query ? `${results.length} results` : "Try a title, genre, or year"}</p>
          <div className="search-results">{results.slice(0, 10).map((anime, index) => <button onClick={() => openAnime(anime)} key={`${anime.id}-${index}`}><span className="result-art" style={posterStyle(anime, index)}>{initials(anime.name)}</span><span><strong>{anime.name}</strong><small>{anime.year || "Anime"} · {anime.status || "Available"}</small></span><b>→</b></button>)}</div>
        </div>
      </div>}

      {libraryOpen && <div className="overlay drawer-overlay" role="dialog" aria-modal="true" aria-label="My List" onMouseDown={(event) => event.currentTarget === event.target && setLibraryOpen(false)}>
        <aside className="library-drawer"><div className="drawer-heading"><div><span className="section-kicker">Saved locally</span><h2>My List</h2></div><button onClick={() => setLibraryOpen(false)}>×</button></div>
          {library.length ? <div className="library-list">{library.map((anime, index) => <div key={anime.id}><button onClick={() => openAnime(anime)}><span className="result-art" style={posterStyle(anime, index)}>{initials(anime.name)}</span><span><strong>{anime.name}</strong><small>{anime.year || "Ready to watch"}</small></span></button><button className="remove-button" onClick={() => toggleLibrary(anime)} aria-label={`Remove ${anime.name}`}>×</button></div>)}</div> : <div className="empty-state"><span>◇</span><h3>Your list is waiting</h3><p>Save anything you want to watch next. It stays on this device.</p><button className="primary-button" onClick={() => { setLibraryOpen(false); setSearchOpen(true); }}>Find anime</button></div>}
        </aside>
      </div>}

      {selected && <div className="overlay detail-overlay" role="dialog" aria-modal="true" aria-label={`${selected.name} details`} onMouseDown={(event) => event.currentTarget === event.target && setSelected(null)}>
        <div className="detail-panel">
          <button className="detail-close" onClick={() => setSelected(null)} aria-label="Close details">×</button>
          <div className="detail-hero" style={posterStyle(selected, 2)}><span className="detail-monogram">{initials(selected.name)}</span></div>
          <div className="detail-content"><span className="section-kicker">{selected.status || "Anime series"}</span><h2>{selected.name}</h2><p className="detail-meta">{selected.year || "—"} · {selected.genres || "Action / Adventure"} {selected.rank ? `· Rank #${selected.rank}` : ""}</p><p className="detail-story">{selected.story || "Story details are loading from the Anime Cloud catalog."}</p>
            <div className="hero-actions"><button className="primary-button" disabled={!selected.episodes.length} onClick={() => selected.episodes[0] && playEpisode(selected.episodes[0])}>▶ {selected.episodes.length ? "Play latest" : "Coming soon"}</button><button className="secondary-button" onClick={() => toggleLibrary(selected)}>{library.some((item) => item.id === selected.id) ? "✓ In My List" : "+ My List"}</button></div>
            <div className="episode-list-heading"><h3>Episodes</h3><span>{detailLoading ? "Loading…" : `${selected.episodes.length} available`}</span></div>
            <div className="episode-list">{selected.episodes.slice(0, 18).map((episode, index) => <button onClick={() => playEpisode(episode)} key={episode.id}><span>{String(selected.episodes.length - index).padStart(2, "0")}</span><strong>{episode.name}</strong>{episode.filler && <small>Filler</small>}<b>▶</b></button>)}</div>
          </div>
        </div>
      </div>}

      {notice && <div className="toast" role="status">{notice}</div>}
      {scheduledToday.length > 0 && <div className="today-indicator" aria-hidden="true">{scheduledToday.length} release{scheduledToday.length > 1 ? "s" : ""} today</div>}
    </main>
  );
}
