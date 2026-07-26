import { putProgress } from "../../../_db";
import { corsJson } from "../../../_legacy";
import { positiveNumber, rateLimit } from "../../../_security";
import { getSession } from "../../../_session";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(request, "progress", 180); if (limited) return limited;
  const session = await getSession(); if (!session) return corsJson({ message: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const duration = positiveNumber(body.duration), position = positiveNumber(body.position);
  putProgress(session.userID, { episodeId: id, animeId: String(body.animeId || ""), episodeNumber: body.episodeNumber == null ? null : positiveNumber(body.episodeNumber), duration, position, watched: Boolean(body.watched) || (duration > 0 && position / duration >= .9) });
  return corsJson({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}

