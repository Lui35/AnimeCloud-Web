import { corsJson } from "../../_legacy";
import { getSession, sealSecret } from "../../_session";
import { getAniListOAuthConfig } from "../../_db";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return corsJson({ message: "Sign in to Anime Cloud first." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const config = getAniListOAuthConfig(session.userID);
  if (!config) return Response.redirect(new URL("/account?anilist=configure", request.url));
  const clientID = String(config.client_id), redirectURI = String(config.redirect_uri);
  const state = sealSecret(JSON.stringify({ userID: session.userID, expires: Date.now() + 10 * 60_000 }));
  const url = new URL("https://anilist.co/api/v2/oauth/authorize");
  url.searchParams.set("client_id", clientID); url.searchParams.set("redirect_uri", redirectURI); url.searchParams.set("response_type", "code"); url.searchParams.set("state", state);
  return Response.redirect(url);
}

