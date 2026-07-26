import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { accountUpload } from "./_legacy";
import { getLibrary, getProgress, getSyncState, putLibraryItem, putProgress, updateSyncState } from "./_db";
import type { AccountSession } from "./_session";

function backupURL(session: AccountSession) {
  const template = process.env.LEGACY_BACKUP_URL_TEMPLATE || "https://animecloudapp.com/usersBackup/{userID}-{uniqID}.sqlite";
  return template.replace("{userID}", encodeURIComponent(session.userID)).replace("{uniqID}", encodeURIComponent(session.uniqID));
}

function readLegacyBackup(bytes: Uint8Array) {
  const folder = mkdtempSync(join(tmpdir(), "anime-cloud-import-"));
  const path = join(folder, "backup.sqlite");
  try {
    writeFileSync(path, bytes);
    const source = new DatabaseSync(path, { readOnly: true });
    const tables = source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => String((row as { name: string }).name));
    const favorites = tables.includes("Favor") ? source.prepare("SELECT animeID, favType FROM Favor").all() as { animeID: string; favType: string }[] : [];
    const seen = tables.includes("Seen") ? source.prepare("SELECT epID, animeID FROM Seen").all() as { epID: string; animeID: string }[] : [];
    source.close();
    return { favorites, seen };
  } finally { rmSync(folder, { recursive: true, force: true }); }
}

function createLegacyBackup(userID: string) {
  const folder = mkdtempSync(join(tmpdir(), "anime-cloud-export-"));
  const path = join(folder, "animeDB.sqlite");
  const target = new DatabaseSync(path);
  target.exec(`CREATE TABLE Favor (id INTEGER PRIMARY KEY AUTOINCREMENT, animeID VARCHAR NOT NULL, favType VARCHAR NOT NULL DEFAULT '0');
    CREATE TABLE Seen (id INTEGER PRIMARY KEY AUTOINCREMENT, epID VARCHAR NOT NULL, animeID VARCHAR NOT NULL DEFAULT '');
    CREATE TABLE lastSeenArray (id INTEGER PRIMARY KEY AUTOINCREMENT, animeID VARCHAR NOT NULL);
    CREATE TABLE reportedComments (id INTEGER PRIMARY KEY AUTOINCREMENT, commentID VARCHAR NOT NULL);`);
  const favorite = target.prepare("INSERT INTO Favor (animeID, favType) VALUES (?, ?)");
  getLibrary(userID).forEach((item) => favorite.run(item.animeId, String(item.category)));
  const seen = target.prepare("INSERT INTO Seen (epID, animeID) VALUES (?, ?)");
  getProgress(userID).filter((item) => item.watched).forEach((item) => seen.run(item.episodeId, item.animeId));
  const recent = target.prepare("INSERT INTO lastSeenArray (animeID) VALUES (?)");
  [...new Set(getProgress(userID).map((item) => item.animeId).filter(Boolean))].slice(0, 30).forEach((animeID) => recent.run(animeID));
  target.close();
  return { bytes: readFileSync(path), cleanup: () => rmSync(folder, { recursive: true, force: true }) };
}

export async function synchronizeLegacy(session: AccountSession) {
  const state = getSyncState(session.userID);
  const now = Date.now();
  let imported = 0;
  try {
    const response = await fetch(backupURL(session), { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (response.ok) {
      const remote = readLegacyBackup(new Uint8Array(await response.arrayBuffer()));
      const existing = new Map(getLibrary(session.userID, true).map((item) => [item.animeId, item]));
      remote.favorites.forEach((item) => {
        const current = existing.get(String(item.animeID));
        if (!current?.deleted) { putLibraryItem(session.userID, { animeId: String(item.animeID), name: current?.name || "", image: current?.image || "", year: current?.year || "", category: Number(item.favType) || 0, deleted: false }, state?.last_legacy_sync_at ? Number(state.last_legacy_sync_at) : now - 1); imported += 1; }
      });
      remote.seen.forEach((item) => putProgress(session.userID, { episodeId: String(item.epID), animeId: String(item.animeID || ""), position: 0, duration: 0, watched: true }, now - 1));
    }
  } catch { /* a missing first backup is valid */ }

  const firstSync = !state?.legacy_baseline_at;
  const lastSync = Number(state?.last_legacy_sync_at || 0);
  const dirty = getLibrary(session.userID, true).some((item) => item.updatedAt > lastSync) || getProgress(session.userID).some((item) => item.updatedAt > lastSync);
  let uploaded = false;
  if (!firstSync && dirty) {
    const backup = createLegacyBackup(session.userID);
    try {
      await accountUpload("saveBackup", { uid: session.userID, uniqID: session.uniqID }, backup.bytes, "fileToUpload", "animeDB.sqlite", "application/octet-stream");
      uploaded = true;
    } finally { backup.cleanup(); }
  }
  updateSyncState(session.userID, { legacyBaselineAt: firstSync ? now : undefined, lastLegacySyncAt: now });
  return { imported, uploaded, firstSync };
}

