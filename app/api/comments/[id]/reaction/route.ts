import { accountCommand, corsJson, rows } from "../../../_legacy";
import { rateLimit } from "../../../_security";
import { getSession } from "../../../_session";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(request, "reaction", 30); if (limited) return limited;
  const session = await getSession(); if (!session) return corsJson({ message: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { reaction?: string };
  const command = body.reaction === "dislike" ? "addDisLike" : body.reaction === "report" ? "reportComment" : "addlike";
  const payload = await accountCommand(command, { commentID: id, userID: session.userID, uniqID: session.uniqID });
  return corsJson({ result: rows(payload)[0] || payload }, { headers: { "Cache-Control": "no-store" } });
}
