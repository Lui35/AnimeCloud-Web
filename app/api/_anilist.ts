const endpoint = "https://graphql.anilist.co";

export async function anilistRequest<T>(query: string, variables: Record<string, unknown>, token?: string): Promise<T> {
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(20_000) });
  const payload = await response.json() as { data?: T; errors?: { message: string }[] };
  if (!response.ok || payload.errors?.length || !payload.data) throw new Error(payload.errors?.[0]?.message || `AniList returned ${response.status}`);
  return payload.data;
}

export function normalizeTitle(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export const viewerQuery = `query { Viewer { id name } }`;
export const collectionQuery = `query ($userId: Int!) { MediaListCollection(userId: $userId, type: ANIME) { lists { entries { status progress updatedAt media { id seasonYear episodes title { romaji english native } } } } } }`;
export const mediaForProgressQuery = `query ($search: String!) { Media(search: $search, type: ANIME) { id mediaListEntry { status progress } } }`;
export const saveEntryMutation = `mutation ($mediaId: Int!, $status: MediaListStatus!, $progress: Int) { SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress) { id status progress } }`;

