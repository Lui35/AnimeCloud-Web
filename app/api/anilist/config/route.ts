import { getAniListOAuthConfig, removeAniListOAuthConfig, saveAniListOAuthConfig } from "../../_db";
import { corsJson } from "../../_legacy";
import { cleanText, rateLimit } from "../../_security";
import { getSession, sealSecret } from "../../_session";

function callbackURL(request: Request) { return `${new URL(request.url).origin}/api/anilist/callback`; }

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return corsJson({ configured: false, callbackURL: callbackURL(request) }, { headers: { "Cache-Control": "private, no-store" } });
  const config = getAniListOAuthConfig(session.userID);
  const clientID = config ? String(config.client_id) : "";
  return corsJson({ configured: Boolean(config), clientIDHint: clientID ? `••••${clientID.slice(-4)}` : "", callbackURL: callbackURL(request) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "anilist-config", 10, 60_000); if (limited) return limited;
  const session = await getSession();
  if (!session) return corsJson({ message: "Sign in to Anime Cloud first." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const clientID = cleanText(body.clientID, 80).trim(), clientSecret = cleanText(body.clientSecret, 500).trim();
  if (!/^\d+$/.test(clientID)) return corsJson({ message: "Enter the numeric AniList Client ID." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  if (clientSecret.length < 10) return corsJson({ message: "Enter the AniList Client Secret." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  saveAniListOAuthConfig(session.userID, clientID, sealSecret(clientSecret), callbackURL(request));
  return corsJson({ ok: true, configured: true, clientIDHint: `••••${clientID.slice(-4)}`, callbackURL: callbackURL(request) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return corsJson({ message: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  removeAniListOAuthConfig(session.userID);
  return corsJson({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
