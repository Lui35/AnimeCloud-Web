import { anime, corsJson, legacyCommand, rows } from "../../_legacy";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const [details, more] = await Promise.all([
      legacyCommand("getAnimeDetails", { animeID: id }),
      legacyCommand("getAnimeMoreDetails", { animeID: id }),
    ]);
    const main = rows(details, "mainResult")[0] || {};
    const extra = rows(more)[0] || {};
    const episodes = rows(details).map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? "Episode"), image: String(row.image300 ?? row.image170 ?? ""), filler: ["1", "true", "yes", "filler", "فلر"].includes(String(row.filer ?? "").toLowerCase()) }));
    let related: ReturnType<typeof anime>[] = [];
    try {
      const relatedData = await legacyCommand("getRelatedAnime", { animeID: id, rootID: String(main.relatedID || id), cmode: "0", hiddenMode: "0" });
      related = rows(relatedData).map(anime).filter((item) => item.id !== id);
    } catch { /* related titles are optional */ }
    return corsJson({ id, name: String(extra.name ?? details.name ?? `Anime ${id}`), image: String(extra.image ?? ""), story: String(extra.story ?? ""), genres: String(extra.genres ?? ""), age: String(main.age ?? ""), rank: String(main.rank ?? ""), status: String(extra.status ?? ""), year: String(extra.year ?? ""), episodes, related });
  } catch (error) {
    return corsJson({ error: error instanceof Error ? error.message : "Details unavailable" }, { status: 502 });
  }
}
