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
