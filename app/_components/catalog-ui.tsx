import Link from "next/link";
import type { CSSProperties } from "react";

export type Anime = { id: string; name: string; image?: string; status?: string; year?: string; day?: string; epName?: string; keywords?: string };
export type Episode = { id: string; name: string; image?: string; filler?: boolean };
export type AnimeDetail = Anime & { story?: string; genres?: string; age?: string; rank?: string; episodes: Episode[]; related: Anime[] };

export function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((word) => word[0]).join(""); }
export function posterStyle(anime: Anime, index = 0): CSSProperties {
  return anime.image ? { backgroundImage: `linear-gradient(180deg, transparent 20%, rgba(8,5,12,.92) 100%), url("${anime.image}")` } : { "--poster-hue": `${(index * 47 + 266) % 360}` } as CSSProperties;
}
export function PosterLink({ anime, index = 0 }: { anime: Anime; index?: number }) {
  const query = new URLSearchParams({ name: anime.name, image: anime.image || "", year: anime.year || "", status: anime.status || "" });
  return <Link className="poster-card" style={posterStyle(anime, index)} href={`/anime/${encodeURIComponent(anime.id)}?${query}`} aria-label={`Open ${anime.name}`}>
    <span className="poster-initials" aria-hidden="true">{initials(anime.name)}</span>
    <span className="poster-copy"><strong>{anime.name}</strong><span>{anime.year || "Anime"} · {anime.status || "Available"}</span></span>
    <span className="poster-play" aria-hidden="true">▶</span>
  </Link>;
}
