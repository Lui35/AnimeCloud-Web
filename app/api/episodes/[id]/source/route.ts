import { corsJson } from "../../../_legacy";
import { resolvePlaybackSource } from "../../../_playback";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    return corsJson(await resolvePlaybackSource(id));
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 502;
    return corsJson({ message: error instanceof Error ? error.message : "Playback unavailable" }, { status });
  }
}
