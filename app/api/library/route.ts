import { getLibrary } from "../_db";
import { corsJson } from "../_legacy";
import { getSession } from "../_session";

export async function GET() {
  const session = await getSession();
  if (!session) return corsJson({ message: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return corsJson({ result: getLibrary(session.userID) }, { headers: { "Cache-Control": "private, no-store" } });
}

