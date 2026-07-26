"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type HeaderUser = { username: string };
let cachedUser: HeaderUser | null | undefined;
let cachedLibraryCount = 0;
const searchIcon = <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" /></svg>;

export function SiteHeader({ active, onSearch }: { active?: "home" | "discover" | "schedule" | "library" | "account"; onSearch?: () => void }) {
  const [user, setUser] = useState<HeaderUser | null | undefined>(cachedUser);
  const [libraryCount, setLibraryCount] = useState(cachedLibraryCount);

  useEffect(() => {
    const refresh = () => fetch("/api/me", { cache: "no-store" }).then((response) => response.json()).then((data: { user: HeaderUser | null }) => {
      cachedUser = data.user; setUser(data.user);
      if (!data.user) { cachedLibraryCount = 0; setLibraryCount(0); return; }
      fetch("/api/library", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((library) => { cachedLibraryCount = library?.result?.length || 0; setLibraryCount(cachedLibraryCount); }).catch(() => undefined);
    }).catch(() => undefined);
    void refresh();
    window.addEventListener("anime-cloud-session-changed", refresh);
    return () => window.removeEventListener("anime-cloud-session-changed", refresh);
  }, []);

  return <header className="site-header">
    <Link className="brand" href="/" aria-label="Anime Cloud home"><span className="brand-mark">AC</span><span>Anime Cloud</span></Link>
    <nav aria-label="Primary navigation">
      <Link className={active === "home" ? "active" : ""} href="/">Home</Link>
      <Link className={active === "discover" ? "active" : ""} href="/discover">Discover</Link>
      <Link className={active === "schedule" ? "active" : ""} href="/schedule">Schedule</Link>
    </nav>
    <div className="header-actions">
      {onSearch ? <button className="icon-button" onClick={onSearch} aria-label="Search">{searchIcon}</button> : <Link className="icon-button" href="/discover?focus=search" aria-label="Search">{searchIcon}</Link>}
      <Link className={`library-button ${active === "library" ? "active" : ""}`} href="/library">My List <span>{libraryCount}</span></Link>
      <Link className="account-button" href="/account"><span>{user === undefined ? "Account" : user?.username || "Sign in"}</span></Link>
    </div>
  </header>;
}
