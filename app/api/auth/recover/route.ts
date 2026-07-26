import { accountCommand, corsJson, rows } from "../../_legacy";
import { cleanText, rateLimit } from "../../_security";

export async function POST(request: Request) {
  const limited = rateLimit(request, "recover", 4, 15 * 60_000); if (limited) return limited;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const email = cleanText(body.email, 254);
  if (!email.includes("@")) return corsJson({ message: "Enter a valid email." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const payload = await accountCommand("recoverPassword", { email });
    const result = rows(payload)[0] || payload;
    return corsJson({ ok: true, message: String(result.message ?? "If the account exists, recovery instructions have been sent.") }, { headers: { "Cache-Control": "no-store" } });
  } catch { return corsJson({ ok: true, message: "If the account exists, recovery instructions have been sent." }, { headers: { "Cache-Control": "no-store" } }); }
}

