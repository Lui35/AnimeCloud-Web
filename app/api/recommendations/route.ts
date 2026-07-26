import { getLibrary } from "../_db";
import { anime, corsJson, legacyCommand, rows } from "../_legacy";
import { cleanText, rateLimit } from "../_security";
import { getSession } from "../_session";

function tokens(value: string) { return [...new Set(value.normalize("NFKD").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter((token) => token.length > 1))]; }

export async function POST(request: Request) {
  const limited = rateLimit(request, "recommendations", 12, 60_000); if (limited) return limited;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const prompt = cleanText(body.prompt, 500), promptTokens = tokens(prompt);
  if (!promptTokens.length) return corsJson({ message: "Describe what you want to watch." }, { status: 400 });
  try {
    const payload = await legacyCommand("getAllAnime", { cmode: "0", hiddenMode: "0" });
    const catalog = rows(payload).map(anime);
    const session = await getSession(); const favorites = new Set(session ? getLibrary(session.userID).filter((item) => item.category === 0).map((item) => item.animeId) : []);
    const result = catalog.map((item) => {
      const searchable = tokens(`${item.name} ${item.keywords} ${item.status} ${item.year}`);
      let score = promptTokens.reduce((sum, token) => sum + (searchable.some((word) => word.includes(token) || token.includes(word)) ? 3 : 0), 0);
      if (favorites.has(item.id)) score += .25;
      return { ...item, score };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 12);
    return corsJson({ result });
  } catch (error) { return corsJson({ message: error instanceof Error ? error.message : "Recommendations unavailable." }, { status: 502 }); }
}
