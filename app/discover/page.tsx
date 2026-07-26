"use client";

import { useEffect, useState } from "react";
import { Anime, PosterLink } from "../_components/catalog-ui";
import { SiteHeader } from "../_components/site-header";
import { PageLoading } from "../_components/page-loading";

export default function DiscoverPage() {
  const [query, setQuery] = useState(""); const [results, setResults] = useState<Anime[]>([]); const [loading, setLoading] = useState(true); const [initialLoad, setInitialLoad] = useState(true);
  useEffect(() => { const timer = setTimeout(async () => { setLoading(true); try { const response = await fetch(`/api/catalog?q=${encodeURIComponent(query)}`, { cache: "no-store" }); const data = await response.json(); setResults(data.result || []); } finally { setLoading(false); setInitialLoad(false); } }, 250); return () => clearTimeout(timer); }, [query]);
  if (initialLoad) return <main><SiteHeader active="discover" /><PageLoading label="Loading Discover" /></main>;
  return <main><SiteHeader active="discover" /><section className="page-hero"><span className="section-kicker">The complete catalog</span><h1>Discover your next world.</h1><p>Search more than 2,500 titles by name, keyword, genre, or year.</p><div className="discover-search"><span>⌕</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search anime, genres, years…" aria-label="Search catalog" /></div></section><section className="content-shell content-section"><div className="section-heading"><div><span className="section-kicker">{loading ? "Searching…" : `${results.length} titles`}</span><h2>{query ? `Results for “${query}”` : "Browse all"}</h2></div></div>{results.length ? <div className="poster-grid discover-grid">{results.map((anime, index) => <PosterLink anime={anime} index={index} key={anime.id} />)}</div> : !loading && <div className="empty-state"><span>◇</span><h3>No titles found</h3><p>Try another title or keyword.</p></div>}</section></main>;
}
