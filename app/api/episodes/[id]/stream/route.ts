import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { resolvePlaybackSource } from "../../../_playback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PASSTHROUGH_HEADERS = ["accept-ranges", "content-length", "content-range", "content-type", "etag", "last-modified"];

function openStream(url: URL, range: string | null, redirects = 0): Promise<IncomingMessage> {
  if (redirects > 4) return Promise.reject(new Error("Too many media redirects"));
  if (url.protocol !== "https:" && url.protocol !== "http:") return Promise.reject(new Error("Unsupported media source"));

  return new Promise((resolve, reject) => {
    const makeRequest = url.protocol === "https:" ? httpsRequest : httpRequest;
    const upstream = makeRequest(url, {
      method: "GET",
      headers: { "User-Agent": "AnimeCloudWeb/1.0", ...(range ? { Range: range } : {}) },
      // The recovered catalog currently returns media from a host with an incomplete certificate chain.
      rejectUnauthorized: url.protocol === "https:" ? false : undefined,
    }, (response) => {
      const location = response.headers.location;
      if (location && response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
        response.resume();
        void openStream(new URL(location, url), range, redirects + 1).then(resolve, reject);
        return;
      }
      resolve(response);
    });
    upstream.setTimeout(15_000, () => upstream.destroy(new Error("Media host timed out")));
    upstream.on("error", reject);
    upstream.end();
  });
}

async function streamEpisode(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const source = await resolvePlaybackSource(id);
    const upstream = await openStream(new URL(source.url), request.headers.get("range"));
    const status = upstream.statusCode || 502;
    if (status !== 200 && status !== 206) {
      upstream.resume();
      return Response.json({ message: `Media host returned ${status}` }, { status: 502 });
    }

    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    for (const name of PASSTHROUGH_HEADERS) {
      const value = upstream.headers[name];
      if (typeof value === "string") headers.set(name, value);
    }

    return new Response(Readable.toWeb(upstream) as ReadableStream<Uint8Array>, { status, headers });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 502;
    return Response.json({ message: error instanceof Error ? error.message : "Playback unavailable" }, { status });
  }
}

export const GET = streamEpisode;
