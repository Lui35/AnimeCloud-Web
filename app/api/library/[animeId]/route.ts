import { putLibraryItem } from "../../_db";
import { corsJson } from "../../_legacy";
import { cleanText, rateLimit } from "../../_security";
import { getSession } from "../../_session";

export async function PUT(request: Request, context: { params: Promise<{ animeId: string }> }) {
  const limited = rateLimit(request, "library", 60); if (limited) return limited;
  const session = await getSession(); if (!session) return corsJson({ message: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { animeId } = await context.params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const category = Math.max(0, Math.min(3, Number(body.category) || 0));
  putLibraryItem(session.userID, { animeId, name: cleanText(body.name, 240), image: cleanText(body.image, 1000), year: cleanText(body.year, 12), category, deleted: Boolean(body.deleted) });
  return corsJson({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}

