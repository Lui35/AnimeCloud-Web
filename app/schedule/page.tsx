"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Anime, posterStyle } from "../_components/catalog-ui";
import { SiteHeader } from "../_components/site-header";
import { PageLoading } from "../_components/page-loading";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export default function SchedulePage() {
  const [schedule, setSchedule] = useState<Anime[]>([]); const [selectedDay, setSelectedDay] = useState(days[new Date().getDay()]); const [loading, setLoading] = useState(true);
  useEffect(() => { const started = Date.now(); fetch("/api/home", { cache: "no-store" }).then((response) => response.json()).then((data) => setSchedule(data.schedule || [])).catch(() => undefined).finally(() => window.setTimeout(() => setLoading(false), Math.max(0, 350 - (Date.now() - started)))); }, []);
  const entries = schedule.filter((anime) => anime.day === selectedDay);
  if (loading) return <main><SiteHeader active="schedule" /><PageLoading label="Loading Schedule" /></main>;
  return <main><SiteHeader active="schedule" /><section className="page-hero"><span className="section-kicker">Release calendar</span><h1>Every release. Every day.</h1><p>Choose a day to see everything scheduled from the live Anime Cloud catalog.</p></section><section className="content-shell content-section"><div className="day-tabs">{days.map((day) => <button className={selectedDay === day ? "active" : ""} onClick={() => setSelectedDay(day)} key={day}><span>{day.slice(0, 3)}</span><small>{schedule.filter((anime) => anime.day === day).length}</small></button>)}</div><div className="schedule-cards">{entries.map((anime, index) => { const query = new URLSearchParams({ name: anime.name, image: anime.image || "", year: anime.year || "", status: anime.status || "" }); return <Link href={`/anime/${encodeURIComponent(anime.id)}?${query}`} key={anime.id}><span className="schedule-art" style={posterStyle(anime, index)} /><span><small>{selectedDay}</small><strong>{anime.name}</strong><em>{anime.status || "New episode"}</em></span><b>→</b></Link>; })}{!entries.length && <div className="empty-state"><span>◇</span><h3>No releases listed</h3><p>Check another day.</p></div>}</div></section></main>;
}
