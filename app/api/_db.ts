import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const databasePath = process.env.DATABASE_PATH || join(process.cwd(), "data", "anime-cloud.sqlite");
let instance: DatabaseSync | null = null;

function database() {
  if (instance) return instance;
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  try { db.exec("PRAGMA journal_mode = WAL;"); } catch { /* another process may be initializing WAL */ }
  db.exec(`
  CREATE TABLE IF NOT EXISTS library_items (
    user_id TEXT NOT NULL,
    anime_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    year TEXT NOT NULL DEFAULT '',
    category INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, anime_id)
  );
  CREATE TABLE IF NOT EXISTS episode_progress (
    user_id TEXT NOT NULL,
    episode_id TEXT NOT NULL,
    anime_id TEXT NOT NULL DEFAULT '',
    episode_number INTEGER,
    position REAL NOT NULL DEFAULT 0,
    duration REAL NOT NULL DEFAULT 0,
    watched INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, episode_id)
  );
  CREATE TABLE IF NOT EXISTS sync_state (
    user_id TEXT PRIMARY KEY,
    legacy_baseline_at INTEGER,
    anilist_baseline_at INTEGER,
    last_legacy_sync_at INTEGER,
    last_anilist_sync_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS anilist_connections (
    user_id TEXT PRIMARY KEY,
    encrypted_token TEXT NOT NULL,
    viewer_id INTEGER,
    viewer_name TEXT,
    connected_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS anilist_oauth_configs (
    user_id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    encrypted_client_secret TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);
  instance = db;
  return db;
}

export type LibraryItem = {
  animeId: string;
  name: string;
  image: string;
  year: string;
  category: number;
  deleted: boolean;
  updatedAt: number;
};

export function getLibrary(userID: string, includeDeleted = false): LibraryItem[] {
  const query = includeDeleted
    ? "SELECT * FROM library_items WHERE user_id = ? ORDER BY updated_at DESC"
    : "SELECT * FROM library_items WHERE user_id = ? AND deleted = 0 ORDER BY updated_at DESC";
  return (database().prepare(query).all(userID) as Record<string, unknown>[]).map((row) => ({ animeId: String(row.anime_id), name: String(row.name), image: String(row.image), year: String(row.year), category: Number(row.category), deleted: Boolean(row.deleted), updatedAt: Number(row.updated_at) }));
}

export function putLibraryItem(userID: string, item: Omit<LibraryItem, "updatedAt">, updatedAt = Date.now()) {
  database().prepare(`INSERT INTO library_items (user_id, anime_id, name, image, year, category, deleted, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, anime_id) DO UPDATE SET name=excluded.name, image=excluded.image, year=excluded.year, category=excluded.category, deleted=excluded.deleted, updated_at=excluded.updated_at
    WHERE excluded.updated_at >= library_items.updated_at`).run(userID, item.animeId, item.name, item.image, item.year, item.category, item.deleted ? 1 : 0, updatedAt);
}

export function getProgress(userID: string) {
  return (database().prepare("SELECT * FROM episode_progress WHERE user_id = ? ORDER BY updated_at DESC").all(userID) as Record<string, unknown>[]).map((row) => ({ episodeId: String(row.episode_id), animeId: String(row.anime_id), episodeNumber: row.episode_number == null ? null : Number(row.episode_number), position: Number(row.position), duration: Number(row.duration), watched: Boolean(row.watched), updatedAt: Number(row.updated_at) }));
}

export function putProgress(userID: string, value: { episodeId: string; animeId?: string; episodeNumber?: number | null; position: number; duration: number; watched: boolean }, updatedAt = Date.now()) {
  const complete = value.watched || (value.duration > 0 && value.position / value.duration >= .95);
  database().prepare(`INSERT INTO episode_progress (user_id, episode_id, anime_id, episode_number, position, duration, watched, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, episode_id) DO UPDATE SET anime_id=excluded.anime_id, episode_number=excluded.episode_number, position=excluded.position, duration=excluded.duration, watched=excluded.watched, updated_at=excluded.updated_at
    WHERE excluded.updated_at >= episode_progress.updated_at`).run(userID, value.episodeId, value.animeId || "", value.episodeNumber ?? null, complete ? 0 : Math.max(0, value.position), Math.max(0, value.duration), complete ? 1 : 0, updatedAt);
}

export function getSyncState(userID: string) {
  return database().prepare("SELECT * FROM sync_state WHERE user_id = ?").get(userID) as Record<string, unknown> | undefined;
}

export function updateSyncState(userID: string, fields: { legacyBaselineAt?: number; anilistBaselineAt?: number; lastLegacySyncAt?: number; lastAnilistSyncAt?: number }) {
  database().prepare(`INSERT INTO sync_state (user_id, legacy_baseline_at, anilist_baseline_at, last_legacy_sync_at, last_anilist_sync_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      legacy_baseline_at=COALESCE(excluded.legacy_baseline_at, sync_state.legacy_baseline_at),
      anilist_baseline_at=COALESCE(excluded.anilist_baseline_at, sync_state.anilist_baseline_at),
      last_legacy_sync_at=COALESCE(excluded.last_legacy_sync_at, sync_state.last_legacy_sync_at),
      last_anilist_sync_at=COALESCE(excluded.last_anilist_sync_at, sync_state.last_anilist_sync_at)`)
    .run(userID, fields.legacyBaselineAt ?? null, fields.anilistBaselineAt ?? null, fields.lastLegacySyncAt ?? null, fields.lastAnilistSyncAt ?? null);
}

export function saveAniListConnection(userID: string, encryptedToken: string, viewerID: number, viewerName: string) {
  database().prepare(`INSERT INTO anilist_connections (user_id, encrypted_token, viewer_id, viewer_name, connected_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET encrypted_token=excluded.encrypted_token, viewer_id=excluded.viewer_id, viewer_name=excluded.viewer_name, connected_at=excluded.connected_at`)
    .run(userID, encryptedToken, viewerID, viewerName, Date.now());
}

export function getAniListConnection(userID: string) {
  return database().prepare("SELECT * FROM anilist_connections WHERE user_id = ?").get(userID) as Record<string, unknown> | undefined;
}

export function removeAniListConnection(userID: string) {
  database().prepare("DELETE FROM anilist_connections WHERE user_id = ?").run(userID);
}

export function saveAniListOAuthConfig(userID: string, clientID: string, encryptedClientSecret: string, redirectURI: string) {
  database().prepare(`INSERT INTO anilist_oauth_configs (user_id, client_id, encrypted_client_secret, redirect_uri, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET client_id=excluded.client_id, encrypted_client_secret=excluded.encrypted_client_secret, redirect_uri=excluded.redirect_uri, updated_at=excluded.updated_at`)
    .run(userID, clientID, encryptedClientSecret, redirectURI, Date.now());
}

export function getAniListOAuthConfig(userID: string) {
  return database().prepare("SELECT * FROM anilist_oauth_configs WHERE user_id = ?").get(userID) as Record<string, unknown> | undefined;
}

export function removeAniListOAuthConfig(userID: string) {
  database().prepare("DELETE FROM anilist_oauth_configs WHERE user_id = ?").run(userID);
}

export function transaction<T>(run: () => T) {
  const db = database();
  db.exec("BEGIN IMMEDIATE");
  try { const result = run(); db.exec("COMMIT"); return result; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}
