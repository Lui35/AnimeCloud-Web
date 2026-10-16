import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("browser code never contains legacy secrets", async () => {
  const page = await read("app/page.tsx");
  assert.doesNotMatch(page, /uniqID|LEGACY_PLAYBACK_PASSWORD|ANILIST_CLIENT_SECRET/);
  assert.match(page, /\/api\/episodes\//);
});

test("session cookie is HTTP-only and same-site", async () => {
  const session = await read("app/api/_session.ts");
  assert.match(session, /httpOnly:\s*true/);
  assert.match(session, /sameSite:\s*"lax"/);
  assert.match(session, /aes-256-gcm/);
});

test("first legacy sync never uploads", async () => {
  const sync = await read("app/api/_legacy-sync.ts");
  assert.match(sync, /if \(!firstSync && dirty\)/);
  assert.match(sync, /current\?\.deleted/);
});

test("standalone project has no Sites hosting configuration", async () => {
  const packageJSON = JSON.parse(await read("package.json"));
  assert.equal(packageJSON.scripts.build, "next build");
  assert.equal(packageJSON.dependencies?.vinext, undefined);
});

test("MPV integration is opt-in and launches a visible controllable Anime4K window", async () => {
  const [route, preference, home, anime] = await Promise.all([
    read("app/api/player/mpv/route.ts"),
    read("app/_components/mpv-status.tsx"),
    read("app/page.tsx"),
    read("app/anime/[id]/page.tsx"),
  ]);
  assert.match(route, /Anime4K_Clamp_Highlights\.glsl/);
  assert.match(route, /glsl-shader=/);
  assert.match(route, /--force-window=immediate/);
  assert.match(route, /--border=yes/);
  assert.match(route, /--osc=yes/);
  assert.match(route, /--osd-duration=3000/);
  assert.match(route, /--input-conf=/);
  assert.match(route, /--input-ipc-server=/);
  assert.match(route, /observe_property/);
  assert.match(route, /Anime4K: Mode \$\{label\} \(HQ\)/);
  assert.match(route, /Anime4K: Disabled/);
  assert.match(route, /"A\+A"/);
  assert.match(route, /"B\+B"/);
  assert.match(route, /"C\+A"/);
  assert.doesNotMatch(route, /shell:\s*true/);
  assert.match(route, /ShellExecute/);
  assert.doesNotMatch(route, /ShowWindow|SetWindowPos/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /activeMpvProcesses/);
  assert.match(route, /Stop-Process -Force/);
  assert.match(route, /shaderPaths\("A"\)\.map/);
  assert.match(preference, /anime-cloud-use-mpv/);
  assert.match(preference, /role="switch"/);
  assert.match(preference, /Stop MPV/);
  assert.match(preference, /Ctrl\+1\/2\/3/);
  assert.match(home, /animeId: selected\.id, episodeNumber:/);
  assert.match(anime, /animeId: id, episodeNumber:/);
  assert.match(home, /mpv\.enabled && mpv\.status\?\.mpv && mpv\.status\.anime4k/);
  assert.match(anime, /mpv\.enabled && mpv\.status\?\.mpv && mpv\.status\.anime4k/);
});
