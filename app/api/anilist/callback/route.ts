import { anilistRequest, viewerQuery } from "../../_anilist";
import { getAniListOAuthConfig, saveAniListConnection } from "../../_db";
import { corsJson } from "../../_legacy";
import { getSession, openSecret, sealSecret } from "../../_session";

export async function GET(request: Request) {
  const url = new URL(request.url), code = url.searchParams.get("code"), stateValue = url.searchParams.get("state");
  const session = await getSession();
  if (!session || !code || !stateValue) return corsJson({ message: "Invalid AniList callback." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const state = JSON.parse(openSecret(stateValue)) as { userID: string; expires: number };
    if (state.userID !== session.userID || state.expires < Date.now()) throw new Error("AniList connection expired.");
    const config = getAniListOAuthConfig(session.userID);
    if (!config) throw new Error("AniList OAuth is not configured for this account.");
    const clientID = String(config.client_id), clientSecret = openSecret(String(config.encrypted_client_secret));
    const redirectURI = String(config.redirect_uri);
    const tokenResponse = await fetch("https://anilist.co/api/v2/oauth/token", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ grant_type: "authorization_code", client_id: clientID, client_secret: clientSecret, redirect_uri: redirectURI, code }) });
    const tokenPayload = await tokenResponse.json() as { access_token?: string };
    if (!tokenResponse.ok || !tokenPayload.access_token) throw new Error("AniList token exchange failed.");
    const viewer = await anilistRequest<{ Viewer: { id: number; name: string } }>(viewerQuery, {}, tokenPayload.access_token);
    saveAniListConnection(session.userID, sealSecret(tokenPayload.access_token), viewer.Viewer.id, viewer.Viewer.name);
    return Response.redirect(new URL("/account?anilist=connected", url.origin));
  } catch (error) { return corsJson({ message: error instanceof Error ? error.message : "AniList connection failed." }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
}

