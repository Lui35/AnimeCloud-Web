export async function GET() {
  return Response.json({ status: "ok", service: "anime-cloud-web" }, {
    headers: { "Cache-Control": "no-store" },
  });
}

