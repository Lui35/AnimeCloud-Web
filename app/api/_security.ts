const buckets = new Map<string, { count: number; resetAt: number }>();

export function clientIP(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

export function rateLimit(request: Request, scope: string, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const key = `${scope}:${clientIP(request)}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) { buckets.set(key, { count: 1, resetAt: now + windowMs }); return null; }
  current.count += 1;
  if (current.count <= limit) return null;
  return Response.json({ message: "Too many requests. Please try again shortly." }, { status: 429, headers: { "Retry-After": String(Math.ceil((current.resetAt - now) / 1000)), "Cache-Control": "no-store" } });
}

export function cleanText(value: unknown, max = 5000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function positiveNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

