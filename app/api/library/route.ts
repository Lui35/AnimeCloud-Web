import { getLibrary, getProgress } from "../_db";
import { anime, corsJson, legacyCommand, rows } from "../_legacy";
import { getSession } from "../_session";

let catalogCache: { expires: number; items: Map<string, ReturnType<typeof anime>> } | null = null;

export async function GET() {
  const session = await getSession();
  if (!session) return corsJson({ message: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const library = getLibrary(session.userID);
  let result = library;
  if (library.some((item) => !item.name || !item.image)) {
    try {
      if (!catalogCache || catalogCache.expires < Date.now()) {
        const payload = await legacyCommand("getAllAnime", { cmode: "0", hiddenMode: "0" });
        catalogCache = { expires: Date.now() + 10 * 60 * 1000, items: new Map(rows(payload).map(anime).map((item) => [item.id, item])) };
      }
      result = library.map((item) => { const details = catalogCache?.items.get(item.animeId); return { ...item, name: item.name || details?.name || `Anime ${item.animeId}`, image: item.image || details?.image || "", year: item.year || details?.year || "" }; });
    } catch { result = library.map((item) => ({ ...item, name: item.name || `Anime ${item.animeId}` })); }
  }
  return corsJson({ result, progress: getProgress(session.userID) }, { headers: { "Cache-Control": "private, no-store" } });
}

