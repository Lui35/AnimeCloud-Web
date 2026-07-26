import { getAniListConnection, removeAniListConnection } from "../../_db";
import { corsJson } from "../../_legacy";
import { getSession } from "../../_session";

export async function GET() {
  const session = await getSession(); if (!session) return corsJson({ connected: false }, { headers: { "Cache-Control": "private, no-store" } });
  const connection = getAniListConnection(session.userID);
  return corsJson({ connected: Boolean(connection), viewer: connection ? { id: connection.viewer_id, name: connection.viewer_name } : null }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE() {
  const session = await getSession(); if (!session) return corsJson({ message: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  removeAniListConnection(session.userID);
  return corsJson({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}

