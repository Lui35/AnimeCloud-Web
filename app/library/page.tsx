"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { posterStyle } from "../_components/catalog-ui";
import { SiteHeader } from "../_components/site-header";

type LibraryItem = { animeId: string; name: string; image: string; year: string; category: number };
const categories = [
  { value: 0, label: "Favorites" },
  { value: 3, label: "Watching now" },
  { value: 2, label: "Watch later" },
  { value: 1, label: "Completed" },
];

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [filter, setFilter] = useState<number | "all">("all");
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => { fetch("/api/library", { cache: "no-store" }).then(async (response) => {
    if (response.status === 401) { setSignedIn(false); return null; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Unable to load My List");
    return data.result as LibraryItem[];
  }).then((result) => result && setItems(result)).catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load My List")).finally(() => setLoading(false)); }, []);

  const visible = useMemo(() => filter === "all" ? items : items.filter((item) => item.category === filter), [items, filter]);
  async function update(item: LibraryItem, category: number | null) {
    const response = await fetch(`/api/library/${encodeURIComponent(item.animeId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: item.name, image: item.image, year: item.year, category: category ?? 0, deleted: category === null }) });
    if (!response.ok) { setMessage("Unable to update this title."); return; }
    setItems((current) => category === null ? current.filter((entry) => entry.animeId !== item.animeId) : current.map((entry) => entry.animeId === item.animeId ? { ...entry, category } : entry));
    setMessage(category === null ? "Removed from My List." : `Moved to ${categories.find((entry) => entry.value === category)?.label}.`);
  }

  return <main><SiteHeader active="library" /><section className="page-hero"><span className="section-kicker">Your personal library</span><h1>My List</h1><p>Favorites, current watches, plans, and completed anime—all synced with Anime Cloud.</p></section><section className="content-shell content-section">
    {!signedIn ? <div className="empty-state"><span>◇</span><h3>Sign in to see My List</h3><p>Your cloud library appears here after you sign in.</p><Link className="primary-button link-button" href="/account">Sign in</Link></div> : loading ? <div className="page-message">Loading your library…</div> : <>
      <div className="library-tabs"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All <span>{items.length}</span></button>{categories.map((category) => <button className={filter === category.value ? "active" : ""} onClick={() => setFilter(category.value)} key={category.value}>{category.label} <span>{items.filter((item) => item.category === category.value).length}</span></button>)}</div>
      {visible.length ? <div className="library-grid">{visible.map((item, index) => { const query = new URLSearchParams({ name: item.name || `Anime ${item.animeId}`, image: item.image || "", year: item.year || "" }); return <article key={item.animeId}><Link className="library-poster" href={`/anime/${encodeURIComponent(item.animeId)}?${query}`} style={posterStyle({ id: item.animeId, name: item.name, image: item.image }, index)} aria-label={`Open ${item.name}`} /><div><span className="section-kicker">{categories.find((category) => category.value === item.category)?.label || "My List"}</span><h2><Link href={`/anime/${encodeURIComponent(item.animeId)}?${query}`}>{item.name || `Anime ${item.animeId}`}</Link></h2><p>{item.year || "Ready to watch"}</p><label>List status<select value={item.category} onChange={(event) => update(item, Number(event.target.value))}>{categories.map((category) => <option value={category.value} key={category.value}>{category.label}</option>)}</select></label><button className="remove-library-item" onClick={() => update(item, null)}>Remove</button></div></article>; })}</div> : <div className="empty-state"><span>◇</span><h3>Nothing here yet</h3><p>Choose a different list or discover something new.</p><Link className="primary-button link-button" href="/discover">Discover anime</Link></div>}
    </>}{message && <div className="toast" role="status">{message}</div>}
  </section></main>;
}
