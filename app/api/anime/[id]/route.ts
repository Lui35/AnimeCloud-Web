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
    const episodes = rows(details).map((row) => { const rawFiller = row.filler ?? row.filer ?? row.isFiller ?? row.is_filler ?? row.type ?? ""; return { id: String(row.id ?? row.epID ?? ""), name: String(row.name ?? row.epName ?? "Episode"), image: String(row.image300 ?? row.image170 ?? row.image ?? ""), filler: ["1", "true", "yes", "filler", "فلر"].includes(String(rawFiller).trim().toLowerCase()) }; });
    let related: ReturnType<typeof anime>[] = [];
    let catalogMatch: ReturnType<typeof anime> | undefined;
    try {
      const relatedData = await legacyCommand("getRelatedAnime", { animeID: id, rootID: String(main.relatedID || id), cmode: "0", hiddenMode: "0" });
      const relatedItems = rows(relatedData).map(anime);
      catalogMatch = relatedItems.find((item) => item.id === id);
      related = relatedItems.filter((item) => item.id !== id);
    } catch { /* related titles are optional */ }
    return corsJson({ id, name: String(extra.name ?? extra.animeName ?? main.name ?? main.animeName ?? details.name ?? catalogMatch?.name ?? `Anime ${id}`), image: String(extra.image ?? extra.animeImage ?? main.image ?? main.animeImage ?? main.image300 ?? catalogMatch?.image ?? episodes[0]?.image ?? ""), story: String(extra.story ?? main.story ?? ""), genres: String(extra.genres ?? main.genres ?? ""), age: String(main.age ?? ""), rank: String(main.rank ?? ""), status: String(extra.status ?? main.status ?? catalogMatch?.status ?? ""), year: String(extra.year ?? main.year ?? catalogMatch?.year ?? ""), episodes, related });
  } catch (error) {
    return corsJson({ error: error instanceof Error ? error.message : "Details unavailable" }, { status: 502 });
  }
}
