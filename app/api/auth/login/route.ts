import { accountCommand, corsJson, rows } from "../../_legacy";
import { setSession } from "../../_session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { email?: string; password?: string };
  if (!body.email || !body.password) return corsJson({ message: "Email and password are required." }, { status: 400 });
  try {
    const payload = await accountCommand("userLogin", { email: body.email, password: body.password });
    const row = rows(payload)[0] || payload;
    if (String(row.status ?? "").toLowerCase() === "false") return corsJson({ message: String(row.message ?? "The email or password is incorrect.") }, { status: 401 });
    const userID = String(row.userid ?? row.userID ?? row.userId ?? row.id ?? row.ID ?? "");
    const uniqID = String(row.uniqid ?? row.uniqID ?? row.uniqId ?? row.uniqueID ?? row.uniqueId ?? row.token ?? "");
    if (!userID || !uniqID) return corsJson({ message: String(row.message ?? "The email or password is incorrect.") }, { status: 401 });
    const session = { userID, uniqID, username: String(row.username ?? row.userName ?? row.name ?? body.email.split("@")[0]), email: String(row.email ?? row.mail ?? body.email), profilePicture: String(row.profilePicture ?? row.image ?? ""), subscribe: String(row.subscribe ?? row.subscription ?? "") };
    await setSession(session);
    return corsJson({ user: { username: session.username, email: session.email, profilePicture: session.profilePicture, subscribe: session.subscribe } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return corsJson({ message: error instanceof Error ? error.message : "Login is temporarily unavailable." }, { status: 502 });
  }
}
