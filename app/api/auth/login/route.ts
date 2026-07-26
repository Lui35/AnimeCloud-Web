import { accountCommand, corsJson, rows } from "../../_legacy";
import { setSession } from "../../_session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { email?: string; password?: string };
  if (!body.email || !body.password) return corsJson({ message: "Email and password are required." }, { status: 400 });
  try {
    const payload = await accountCommand("userLogin", { email: body.email, password: body.password });
    const row = rows(payload)[0] || payload;
    const userID = String(row.userid ?? row.userID ?? "");
    const uniqID = String(row.uniqid ?? row.uniqID ?? "");
    if (!userID || !uniqID) return corsJson({ message: String(row.message ?? "The email or password is incorrect.") }, { status: 401 });
    const session = { userID, uniqID, username: String(row.username ?? body.email.split("@")[0]), email: String(row.email ?? body.email), profilePicture: String(row.profilePicture ?? ""), subscribe: String(row.subscribe ?? "") };
    await setSession(session);
    return corsJson({ user: { username: session.username, email: session.email, profilePicture: session.profilePicture, subscribe: session.subscribe } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return corsJson({ message: error instanceof Error ? error.message : "Login is temporarily unavailable." }, { status: 502 });
  }
}
