import { anime, corsJson, legacyCommand, rows } from "../_legacy";

let cache: { expires: number; items: ReturnType<typeof anime>[] } | null = null;

export async function GET(request: Request) {
  try {
    if (!cache || cache.expires < Date.now()) {
      const payload = await legacyCommand("getAllAnime", { cmode: "0", hiddenMode: "0" });
      cache = { expires: Date.now() + 10 * 60 * 1000, items: rows(payload).map(anime) };
    }
    const query = new URL(request.url).searchParams.get("q")?.trim().toLocaleLowerCase() || "";
    const result = query ? cache.items.filter((item) => `${item.name} ${item.keywords} ${item.year}`.toLocaleLowerCase().includes(query)).slice(0, 24) : cache.items.slice(0, 60);
    return corsJson({ result, total: cache.items.length });
  } catch (error) {
    return corsJson({ result: [], error: error instanceof Error ? error.message : "Catalog unavailable" }, { status: 502 });
  }
}
