import { accountCommand, corsJson, rows } from "../../_legacy";
import { rateLimit, cleanText } from "../../_security";

export async function POST(request: Request) {
  const limited = rateLimit(request, "signup", 5, 15 * 60_000); if (limited) return limited;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const username = cleanText(body.username, 60), email = cleanText(body.email, 254), password = cleanText(body.password, 200);
  if (!username || !email.includes("@") || password.length < 8) return corsJson({ message: "Enter a username, valid email, and password of at least 8 characters." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const payload = await accountCommand("userSignup", { username, email, password, token: "" });
    const result = rows(payload)[0] || payload;
    return corsJson({ ok: String(result.status ?? "1") !== "0", message: String(result.message ?? "Account created. Check your email if activation is required.") }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return corsJson({ message: error instanceof Error ? error.message : "Signup unavailable." }, { status: 502, headers: { "Cache-Control": "no-store" } }); }
}

