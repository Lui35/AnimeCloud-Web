import { getAniListConnection, getAniListOAuthConfig, removeAniListConnection } from "../../_db";
import { corsJson } from "../../_legacy";
import { getSession } from "../../_session";

export async function GET(request: Request) {
  const callbackURL = `${new URL(request.url).origin}/api/anilist/callback`;
  const session = await getSession(); if (!session) return corsJson({ connected: false, configured: false, callbackURL }, { headers: { "Cache-Control": "private, no-store" } });
  const connection = getAniListConnection(session.userID), config = getAniListOAuthConfig(session.userID), clientID = config ? String(config.client_id) : "";
  return corsJson({ connected: Boolean(connection), configured: Boolean(config), clientIDHint: clientID ? `••••${clientID.slice(-4)}` : "", callbackURL, viewer: connection ? { id: connection.viewer_id, name: connection.viewer_name } : null }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE() {
  const session = await getSession(); if (!session) return corsJson({ message: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  removeAniListConnection(session.userID);
  return corsJson({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}

