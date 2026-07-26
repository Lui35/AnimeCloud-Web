import { createDecipheriv, createHmac, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { corsJson, legacyPlayback, rows } from "../../../_legacy";

function decryptRNCryptor(input: string, password: string) {
  const data = Buffer.from(input.trim().replace(/^"|"$/g, ""), "base64");
  if (data.length < 66 || data[0] !== 3) throw new Error("Unsupported playback payload");
  const encryptionSalt = data.subarray(2, 10);
  const hmacSalt = data.subarray(10, 18);
  const iv = data.subarray(18, 34);
  const ciphertext = data.subarray(34, -32);
  const receivedHmac = data.subarray(-32);
  const hmacKey = pbkdf2Sync(password, hmacSalt, 10000, 32, "sha1");
  const computedHmac = createHmac("sha256", hmacKey).update(data.subarray(0, -32)).digest();
  if (!timingSafeEqual(receivedHmac, computedHmac)) throw new Error("Playback integrity check failed");
  const key = pbkdf2Sync(password, encryptionSalt, 10000, 32, "sha1");
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const password = process.env.LEGACY_PLAYBACK_PASSWORD;
  if (!password) return corsJson({ message: "Playback will be available after the server playback key is configured." }, { status: 503 });
  try {
    const raw = await legacyPlayback(id);
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const direct = rows(parsed)[0];
      if (direct?.url) return corsJson({ url: String(direct.url), note: String(direct.note ?? "") });
    } catch { /* encrypted responses are intentionally not JSON */ }
    const plaintext = decryptRNCryptor(raw, password);
    const decoded = JSON.parse(plaintext) as Record<string, unknown>;
    const row = rows(decoded)[0] || decoded;
    if (!row.url) throw new Error("No playable source returned");
    return corsJson({ url: String(row.url), note: String(row.note ?? "") });
  } catch (error) {
    return corsJson({ message: error instanceof Error ? error.message : "Playback unavailable" }, { status: 502 });
  }
}
