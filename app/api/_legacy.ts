const CATALOG_URL = process.env.LEGACY_CATALOG_URL || "https://khkhkhkh.com/animecp/animeapi65/";
const ACCOUNT_URL = process.env.LEGACY_ACCOUNT_URL || "https://animecloudapp.com/aanimeApp65/";

export type RawRecord = Record<string, unknown>;

export async function legacyCommand(command: string, fields: Record<string, string> = {}) {
  const body = new URLSearchParams({ command, ...fields });
  const response = await fetch(CATALOG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "AnimeCloudWeb/1.0" },
    body,
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Legacy catalog returned ${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

export async function legacyPlayback(epID: string) {
  const body = new URLSearchParams({ command: "getVideoURL", epID, quality: "1" });
  const response = await fetch(CATALOG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "AnimeCloudWeb/1.0" },
    body,
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Legacy playback returned ${response.status}`);
  return response.text();
}

export async function accountCommand(command: string, fields: Record<string, string> = {}) {
  const response = await fetch(ACCOUNT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "AnimeCloudWeb/1.0" },
    body: new URLSearchParams({ command, ...fields }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Legacy account service returned ${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

export async function accountUpload(command: string, fields: Record<string, string>, bytes: Uint8Array, fileField: string, filename: string, contentType: string) {
  const form = new FormData();
  form.set("command", command);
  Object.entries(fields).forEach(([name, value]) => form.set(name, value));
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  form.set(fileField, new Blob([body.buffer], { type: contentType }), filename);
  const response = await fetch(ACCOUNT_URL, { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Legacy upload returned ${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

export function rows(payload: Record<string, unknown>, key = "result") {
  return Array.isArray(payload[key]) ? payload[key] as RawRecord[] : [];
}

export function anime(row: RawRecord) {
  const rawDay = String(row.day ?? "");
  const day = ["", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][Number(rawDay)] || rawDay;
  return {
    id: String(row.id ?? row.animeID ?? ""),
    name: String(row.name ?? row.animeName ?? "Untitled"),
    image: String(row.image ?? row.image300 ?? row.image170 ?? ""),
    status: String(row.status ?? ""),
    year: String(row.year ?? ""),
    day,
    epName: String(row.epName ?? ""),
    keywords: String(row.keywords ?? ""),
  };
}

export function corsJson(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", init.status && init.status >= 400 ? "no-store" : "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  return Response.json(data, { ...init, headers });
}
