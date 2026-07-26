import { corsJson } from "../../_legacy";
import { clearSession } from "../../_session";

export async function POST() {
  await clearSession();
  return corsJson({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
