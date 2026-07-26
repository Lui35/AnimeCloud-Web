import { accountCommand, corsJson, rows } from "../_legacy";
import { cleanText, rateLimit } from "../_security";
import { getSession, setSession } from "../_session";

export async function PATCH(request: Request) {
  const limited = rateLimit(request, "profile", 8, 10 * 60_000); if (limited) return limited;
  const session = await getSession();
  if (!session) return corsJson({ message: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  try {
    if (body.username) {
      const newUsername = cleanText(body.username, 60);
      const payload = await accountCommand("changeUsername", { userID: session.userID, uniqID: session.uniqID, newUsername, oldUsername: session.username });
      session.username = newUsername; await setSession(session);
      return corsJson({ user: { username: newUsername, email: session.email }, result: rows(payload)[0] || payload }, { headers: { "Cache-Control": "no-store" } });
    }
    const oldPassword = cleanText(body.oldPassword, 200), newPassword = cleanText(body.newPassword, 200);
    if (!oldPassword || newPassword.length < 8) return corsJson({ message: "Both passwords are required; the new password must have at least 8 characters." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    const payload = await accountCommand("changeUserPassword", { userID: session.userID, uniqID: session.uniqID, oldPassword, newPassword });
    return corsJson({ ok: true, result: rows(payload)[0] || payload }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return corsJson({ message: error instanceof Error ? error.message : "Profile update failed." }, { status: 502, headers: { "Cache-Control": "no-store" } }); }
}

