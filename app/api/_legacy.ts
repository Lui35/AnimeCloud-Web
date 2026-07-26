const CATALOG_URL = "https://khkhkhkh.com/animecp/animeapi65/";

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

export function rows(payload: Record<string, unknown>, key = "result") {
  return Array.isArray(payload[key]) ? payload[key] as RawRecord[] : [];
}

export function anime(row: RawRecord) {
  return {
    id: String(row.id ?? row.animeID ?? ""),
    name: String(row.name ?? row.animeName ?? "Untitled"),
    image: String(row.image ?? row.image300 ?? row.image170 ?? ""),
    status: String(row.status ?? ""),
    year: String(row.year ?? ""),
    day: String(row.day ?? ""),
    epName: String(row.epName ?? ""),
    keywords: String(row.keywords ?? ""),
  };
}

export function corsJson(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  return Response.json(data, { ...init, headers });
}
