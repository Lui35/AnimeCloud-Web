import { corsJson } from "../_legacy";
import { getSession } from "../_session";

export async function GET() {
  const session = await getSession();
  if (!session) return corsJson({ user: null }, { headers: { "Cache-Control": "private, no-store" } });
  return corsJson({ user: { username: session.username, email: session.email, profilePicture: session.profilePicture, subscribe: session.subscribe } }, { headers: { "Cache-Control": "private, no-store" } });
}
