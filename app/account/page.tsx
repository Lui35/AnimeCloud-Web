"use client";

import { FormEvent, useEffect, useState } from "react";
import { SiteHeader } from "../_components/site-header";

type User = { username: string; email: string; profilePicture?: string; subscribe?: string };
type AniListStatus = { connected: boolean; configured: boolean; clientIDHint?: string; callbackURL?: string; viewer?: { name?: string } | null };

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [aniList, setAniList] = useState<AniListStatus>({ connected: false, configured: false });
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [username, setUsername] = useState("");
  const [clientID, setClientID] = useState(""), [clientSecret, setClientSecret] = useState("");
  const [mode, setMode] = useState<"login" | "signup" | "recover">("login");
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);

  async function refresh() {
    const [me, status] = await Promise.all([
      fetch("/api/me", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/anilist/status", { cache: "no-store" }).then((response) => response.json()),
    ]);
    setUser(me.user); setAniList(status);
  }
  useEffect(() => { void Promise.all([fetch("/api/me", { cache: "no-store" }).then((response) => response.json()), fetch("/api/anilist/status", { cache: "no-store" }).then((response) => response.json())]).then(([me, status]) => { setUser(me.user); setAniList(status); }).catch(() => undefined); }, []);

  async function submitAccount(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password, username }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message || "Unable to continue");
      if (mode !== "login") { setMessage(data.message || "Request completed."); setMode("login"); return; }
      setUser(data.user); setPassword(""); window.dispatchEvent(new Event("anime-cloud-session-changed"));
      setMessage("Signed in. Importing your library and watched episodes…");
      const sync = await fetch("/api/library/sync", { method: "POST" }), syncData = await sync.json();
      window.dispatchEvent(new Event("anime-cloud-session-changed")); await refresh();
      setMessage(sync.ok ? `Signed in. ${syncData.imported || 0} cloud items imported safely.` : "Signed in. Cloud sync can be retried below.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to continue"); }
    finally { setBusy(false); }
  }
  async function action(url: string, success: string) {
    setBusy(true); setMessage("");
    try { const response = await fetch(url, { method: "POST" }), data = await response.json(); if (!response.ok) throw new Error(data.message || "Request failed"); setMessage(success); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Request failed"); }
    finally { setBusy(false); }
  }
  async function configureAniList(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/anilist/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientID: clientID.trim(), clientSecret }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message || "Unable to save AniList configuration");
      setClientSecret(""); setAniList((current) => ({ ...current, ...data }));
      window.location.assign("/api/anilist/connect");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to configure AniList"); setBusy(false); }
  }

  return <main><SiteHeader active="account" /><section className="page-hero"><span className="section-kicker">Account & integrations</span><h1>Your cloud, connected.</h1><p>Sign in to Anime Cloud and connect an AniList OAuth application securely from this website.</p></section><section className="account-grid content-shell">
    <article className="account-card"><span className="section-kicker">Anime Cloud account</span>{user ? <><h2>{user.username}</h2><p>{user.email}</p><p>Subscription: {user.subscribe || "Standard"}</p><div className="stack-actions"><button className="primary-button" disabled={busy} onClick={() => action("/api/library/sync", "Anime Cloud library synced.")}>Sync Anime Cloud library</button><button className="secondary-button" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); setUser(null); window.dispatchEvent(new Event("anime-cloud-session-changed")); }}>Sign out</button></div></> : <form onSubmit={submitAccount}><div className="auth-tabs"><button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Sign in</button><button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Create</button><button type="button" className={mode === "recover" ? "active" : ""} onClick={() => setMode("recover")}>Recover</button></div><h2>{mode === "signup" ? "Create account" : mode === "recover" ? "Recover access" : "Sign in"}</h2>{mode === "signup" && <label>Username<input required value={username} onChange={(event) => setUsername(event.target.value)} /></label>}<label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>{mode !== "recover" && <label>Password<input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>}<button className="primary-button" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "recover" ? "Send recovery" : "Sign in securely"}</button></form>}</article>
    <article className="account-card anilist-card"><span className="section-kicker">AniList</span><h2>{aniList.connected ? `Connected as ${aniList.viewer?.name || "AniList user"}` : aniList.configured ? "Ready to connect" : "Configure AniList"}</h2><p>Create an OAuth application in AniList Developer Settings and register this exact callback URL:</p><code className="callback-url">{aniList.callbackURL || "http://localhost:3000/api/anilist/callback"}</code>{!user ? <p className="integration-help">Sign in to Anime Cloud before saving AniList credentials.</p> : <>{aniList.connected && <div className="stack-actions"><button className="primary-button" disabled={busy} onClick={() => action("/api/anilist/sync", "AniList sync completed.")}>Sync now</button><button className="secondary-button" onClick={async () => { await fetch("/api/anilist/status", { method: "DELETE" }); await refresh(); }}>Disconnect</button></div>}{aniList.configured && !aniList.connected && <div className="configured-integration"><span>Saved application {aniList.clientIDHint}</span><a className="primary-button link-button" href="/api/anilist/connect">Connect AniList</a></div>}<form className="anilist-config-form" onSubmit={configureAniList}><h3>{aniList.configured ? "Replace OAuth credentials" : "Enter OAuth credentials"}</h3><label>AniList Client ID<input inputMode="numeric" autoComplete="off" required value={clientID} onChange={(event) => setClientID(event.target.value)} placeholder="Numeric client ID" /></label><label>AniList Client Secret<input type="password" autoComplete="off" required minLength={10} value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder="Stored encrypted on this server" /></label><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save and connect"}</button><small>The secret is encrypted at rest and is never returned to the browser.</small></form></>}</article>
    {message && <div className="auth-message" role="status">{message}</div>}
  </section></main>;
}
