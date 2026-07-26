import { anilistRequest, mediaForProgressQuery, saveEntryMutation } from "../../_anilist";
import { getAniListConnection, getLibrary, getProgress } from "../../_db";
import { corsJson } from "../../_legacy";
import { cleanText, rateLimit } from "../../_security";
import { getSession, openSecret } from "../../_session";

type MediaResult = { Media: { id: number; mediaListEntry?: { status?: string; progress?: number } | null } | null };

export async function POST(request: Request) {
  const limited = rateLimit(request, "anilist-progress", 60); if (limited) return limited;
  const session = await getSession();
  if (!session) return corsJson({ message: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const connection = getAniListConnection(session.userID);
  if (!connection) return corsJson({ message: "AniList is not connected." }, { status: 400, headers: { "Cache-Control": "no-store" } });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const animeId = cleanText(body.animeId, 100);
  const animeName = cleanText(body.animeName, 240);
  if (!animeId || !animeName) return corsJson({ message: "Anime details are required." }, { status: 400, headers: { "Cache-Control": "no-store" } });

  try {
    const token = openSecret(String(connection.encrypted_token));
    const result = await anilistRequest<MediaResult>(mediaForProgressQuery, { search: animeName }, token);
    if (!result.Media) throw new Error("This anime could not be matched on AniList.");

    const watchedThrough = Math.max(0, ...getProgress(session.userID)
      .filter((row) => row.animeId === animeId && row.watched)
      .map((row) => row.episodeNumber || 0));
    const libraryItem = getLibrary(session.userID).find((item) => item.animeId === animeId);
    const localStatus = libraryItem?.category === 1 ? "COMPLETED" : libraryItem?.category === 2 ? "PLANNING" : libraryItem?.category === 3 ? "CURRENT" : null;
    const currentStatus = result.Media.mediaListEntry?.status;
    const status = localStatus || currentStatus || "CURRENT";

    await anilistRequest(saveEntryMutation, { mediaId: result.Media.id, status, progress: watchedThrough }, token);
    return corsJson({ synced: true, progress: watchedThrough, status }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return corsJson({ message: error instanceof Error ? error.message : "AniList progress sync failed." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
