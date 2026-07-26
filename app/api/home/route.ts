import { anime, corsJson, legacyCommand, rows } from "../_legacy";

export async function GET() {
  try {
    const [featuredData, scheduleData, latestData] = await Promise.all([
      legacyCommand("getMost", { cmode: "0", hiddenMode: "0" }),
      legacyCommand("getAnimeWithDays", { cmode: "0", hiddenMode: "0" }),
      legacyCommand("getNewEpAndAnime", { cmode: "0", hiddenMode: "0" }),
    ]);
    const latestRows = rows(latestData, "result2").length ? rows(latestData, "result2") : rows(latestData);
    return corsJson({ featured: rows(featuredData).map(anime), schedule: rows(scheduleData).map(anime), latest: latestRows.map(anime), source: "live" });
  } catch (error) {
    return corsJson({ error: "Catalog temporarily unavailable", detail: error instanceof Error ? error.message : "Unknown error" }, { status: 502 });
  }
}
