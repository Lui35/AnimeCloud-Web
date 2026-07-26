import { accountCommand, corsJson, rows } from "../_legacy";
import { cleanText, positiveNumber, rateLimit } from "../_security";
import { getSession } from "../_session";

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const episodeID = cleanText(search.get("episodeId"), 80), animeID = cleanText(search.get("animeId"), 80);
  if (!episodeID && !animeID) return corsJson({ message: "episodeId or animeId is required." }, { status: 400 });
  try {
    const payload = await accountCommand(episodeID ? "getComments" : "getAnimeComments", { offset: String(positiveNumber(search.get("offset"))), orderBy: search.get("order") === "oldest" ? "ASC" : "DESC", ...(episodeID ? { epID: episodeID } : { animeID }) });
    return corsJson({ result: rows(payload) });
  } catch (error) { return corsJson({ message: error instanceof Error ? error.message : "Comments unavailable." }, { status: 502 }); }
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "comment", 10, 5 * 60_000); if (limited) return limited;
  const session = await getSession(); if (!session) return corsJson({ message: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const content = cleanText(body.content, 2000);
  if (content.length < 2) return corsJson({ message: "Comment is too short." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const payload = await accountCommand("addComment", { epID: cleanText(body.episodeId, 80), userID: session.userID, uniqID: session.uniqID, content, animeName: cleanText(body.animeName, 200), epName: cleanText(body.episodeName, 200) });
    return corsJson({ result: rows(payload)[0] || payload }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return corsJson({ message: error instanceof Error ? error.message : "Could not add comment." }, { status: 502, headers: { "Cache-Control": "no-store" } }); }
}

export async function PATCH(request: Request) {
  const session = await getSession(); if (!session) return corsJson({ message: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const payload = await accountCommand("updateComment", { commentID: cleanText(body.commentId, 80), userID: session.userID, uniqID: session.uniqID, content: cleanText(body.content, 2000), epName: cleanText(body.episodeName, 200), animeName: cleanText(body.animeName, 200) });
  return corsJson({ result: rows(payload)[0] || payload }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const session = await getSession(); if (!session) return corsJson({ message: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const commentID = cleanText(new URL(request.url).searchParams.get("id"), 80);
  const payload = await accountCommand("deleteComment", { commentID, userID: session.userID, uniqID: session.uniqID });
  return corsJson({ result: rows(payload)[0] || payload }, { headers: { "Cache-Control": "no-store" } });
}

