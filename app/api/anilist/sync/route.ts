import { anilistRequest, collectionQuery, normalizeTitle, saveEntryMutation } from "../../_anilist";
import { getAniListConnection, getLibrary, getProgress, getSyncState, putLibraryItem, updateSyncState } from "../../_db";
import { anime, corsJson, legacyCommand, rows } from "../../_legacy";
import { rateLimit } from "../../_security";
import { getSession, openSecret } from "../../_session";

type AniEntry = { status: string; progress: number; updatedAt: number; media: { id: number; seasonYear?: number; episodes?: number; title: { romaji?: string; english?: string; native?: string } } };

export async function POST(request: Request) {
  const limited = rateLimit(request, "anilist-sync", 3, 60_000); if (limited) return limited;
  const session = await getSession(); if (!session) return corsJson({ message: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const connection = getAniListConnection(session.userID); if (!connection) return corsJson({ message: "Connect AniList first." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const token = openSecret(String(connection.encrypted_token));
    const collection = await anilistRequest<{ MediaListCollection: { lists: { entries: AniEntry[] }[] } }>(collectionQuery, { userId: Number(connection.viewer_id) }, token);
    const entries = collection.MediaListCollection.lists.flatMap((list) => list.entries);
    const catalogPayload = await legacyCommand("getAllAnime", { cmode: "0", hiddenMode: "0" });
    const catalog = rows(catalogPayload).map(anime);
    const byTitle = new Map<string, typeof catalog[number]>();
    catalog.forEach((item) => byTitle.set(`${normalizeTitle(item.name)}:${item.year}`, item));
    const existing = new Map(getLibrary(session.userID, true).map((item) => [item.animeId, item]));
    const statusCategory: Record<string, number> = { COMPLETED: 1, PLANNING: 2, CURRENT: 3, REPEATING: 3 };
    let imported = 0;
    const matched = new Map<string, AniEntry>();
    entries.forEach((entry) => {
      const titles = [entry.media.title.english, entry.media.title.romaji, entry.media.title.native].filter(Boolean) as string[];
      const match = titles.map((title) => byTitle.get(`${normalizeTitle(title)}:${entry.media.seasonYear || ""}`) || catalog.find((item) => normalizeTitle(item.name) === normalizeTitle(title))).find(Boolean);
      if (!match) return;
      matched.set(match.id, entry);
      if (!existing.has(match.id) && statusCategory[entry.status] != null) { putLibraryItem(session.userID, { animeId: match.id, name: match.name, image: match.image || "", year: match.year || "", category: statusCategory[entry.status], deleted: false }, entry.updatedAt * 1000 || Date.now() - 1); imported += 1; }
    });
    const state = getSyncState(session.userID), firstSync = !state?.anilist_baseline_at;
    let uploaded = 0;
    if (!firstSync) {
      const changed = getLibrary(session.userID).filter((item) => item.category > 0 && item.updatedAt > Number(state?.last_anilist_sync_at || 0));
      for (const item of changed.slice(0, 25)) {
        const entry = matched.get(item.animeId); if (!entry) continue;
        const progress = Math.max(0, ...getProgress(session.userID).filter((row) => row.animeId === item.animeId && row.watched).map((row) => row.episodeNumber || 0));
        const status = item.category === 1 ? "COMPLETED" : item.category === 2 ? "PLANNING" : "CURRENT";
        await anilistRequest(saveEntryMutation, { mediaId: entry.media.id, status, progress: progress || null }, token); uploaded += 1;
      }
    }
    const now = Date.now(); updateSyncState(session.userID, { anilistBaselineAt: firstSync ? now : undefined, lastAnilistSyncAt: now });
    return corsJson({ imported, uploaded, skippedAmbiguous: Math.max(0, entries.length - matched.size), firstSync }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return corsJson({ message: error instanceof Error ? error.message : "AniList sync failed." }, { status: 502, headers: { "Cache-Control": "no-store" } }); }
}

