import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "anime_cloud_session";

export type AccountSession = {
  userID: string;
  uniqID: string;
  username: string;
  email: string;
  profilePicture?: string;
  subscribe?: string;
};

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  return createHash("sha256").update(secret).digest();
}

function seal(value: AccountSession) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function sealSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function openSecret(value: string) {
  const data = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}

function unseal(value: string) {
  const data = Buffer.from(value, "base64url");
  if (data.length < 29) throw new Error("Invalid session");
  const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8")) as AccountSession;
}

export async function setSession(session: AccountSession) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, seal(session), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export async function getSession() {
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  if (!value) return null;
  try { return unseal(value); } catch { return null; }
}

export async function clearSession() {
  (await cookies()).delete(COOKIE_NAME);
}
