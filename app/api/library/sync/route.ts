import { corsJson } from "../../_legacy";
import { synchronizeLegacy } from "../../_legacy-sync";
import { rateLimit } from "../../_security";
import { getSession } from "../../_session";

export async function POST(request: Request) {
  const limited = rateLimit(request, "legacy-sync", 4, 60_000); if (limited) return limited;
  const session = await getSession(); if (!session) return corsJson({ message: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try { return corsJson(await synchronizeLegacy(session), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return corsJson({ message: error instanceof Error ? error.message : "Cloud sync failed." }, { status: 502, headers: { "Cache-Control": "no-store" } }); }
}
