import { anime, corsJson, legacyCommand, rows } from "../_legacy";

export async function GET() {
  try {
    const requests = await Promise.allSettled([
      legacyCommand("getMost", { cmode: "0", hiddenMode: "0" }),
      legacyCommand("getAnimeWithDays", { cmode: "0", hiddenMode: "0" }),
      legacyCommand("getNewEpAndAnime", { cmode: "0", hiddenMode: "0" }),
    ]);
    const [featuredData, scheduleData, latestData] = requests.map((request) => request.status === "fulfilled" ? request.value : {});
    const firstFailure = requests.find((request): request is PromiseRejectedResult => request.status === "rejected");
    if (requests.every((request) => request.status === "rejected")) throw firstFailure?.reason || new Error("Catalog unavailable");
    const newAnimeRows = rows(latestData), latestRows = rows(latestData, "result2");
    return corsJson({ featured: rows(featuredData).map(anime), schedule: rows(scheduleData).map(anime), newAnime: newAnimeRows.map(anime), latest: (latestRows.length ? latestRows : newAnimeRows).map(anime), source: "live" });
  } catch (error) {
    return corsJson({ error: "Catalog temporarily unavailable", detail: error instanceof Error ? error.message : "Unknown error" }, { status: 502 });
  }
}
