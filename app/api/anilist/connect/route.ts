import { corsJson } from "../../_legacy";
import { getSession, sealSecret } from "../../_session";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return corsJson({ message: "Sign in to Anime Cloud first." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const clientID = process.env.ANILIST_CLIENT_ID;
  if (!clientID) return corsJson({ message: "ANILIST_CLIENT_ID is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const redirectURI = process.env.ANILIST_REDIRECT_URI || `${new URL(request.url).origin}/api/anilist/callback`;
  const state = sealSecret(JSON.stringify({ userID: session.userID, expires: Date.now() + 10 * 60_000 }));
  const url = new URL("https://anilist.co/api/v2/oauth/authorize");
  url.searchParams.set("client_id", clientID); url.searchParams.set("redirect_uri", redirectURI); url.searchParams.set("response_type", "code"); url.searchParams.set("state", state);
  return Response.redirect(url);
}

