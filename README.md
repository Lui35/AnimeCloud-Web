# Anime Cloud Web

A standalone Next.js web client and backend proxy for the recovered Anime Cloud 6.5 services. It is not tied to ChatGPT hosting or authentication and can be deployed on any Node.js platform that supports Next.js.

## Included

- Cinematic, responsive English web client
- Server-side proxy for the legacy catalog gateway
- Cached search across the 2,500+ title catalog
- Home, schedule, new episodes and anime-detail APIs
- RNCryptor-compatible playback decryption on the server
- Legacy account login through an encrypted, HTTP-only session cookie
- Legacy signup, recovery, profile changes and comments
- Device-local and account-backed library/progress storage
- Safe legacy SQLite backup import and upload with deletion tombstones
- AniList OAuth, first-import protection and two-way status/progress sync
- Catalog-grounded recommendation matching
- In-page video playback, resume, completion and watched-state tracking
- Local MPV playback with Anime4K GLSL upscaling and browser fallback
- Rate limiting, input validation and security headers
- Social preview metadata and artwork

## Local setup

1. Install Node.js 22 or newer.
2. Create your local configuration:

```bash
cp .env.example .env.local
```

3. Generate a random session secret and paste it into `.env.local`:

```bash
openssl rand -base64 48
```

4. Set `LEGACY_PLAYBACK_PASSWORD` if playback should be enabled.
5. Start the application:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Optional MPV + Anime4K playback

Browser playback is the default. When MPV and the complete high-end Anime4K shader set are detected, the episode panel shows a saved **Use MPV** switch. Turn it on to use native playback or leave it off to use the website player. If native launch fails, playback falls back to the browser.

1. Install [MPV](https://mpv.io/) or [mpv.net](https://github.com/mpvnet-player/mpv.net).
2. Download the Anime4K v4.0.1 [Windows high-end bundle](https://github.com/Tama47/Anime4K/releases/download/v4.0.1/GLSL_Windows_High-end.zip).
3. Extract its `shaders` folder and set `ANIME4K_SHADER_DIR` to that folder. For standard MPV, `%APPDATA%\mpv\shaders` is detected automatically.
4. Set `MPV_PATH` to the full path of `mpv.exe` or `mpvnet.exe`, then restart the Next.js server.

AnimeCloud starts each episode in high-end Mode A and supplies its own per-launch bindings, so it does not depend on the user's `input.conf` or `mpv.conf`. With the MPV window focused, use `Ctrl+1`, `Ctrl+2`, or `Ctrl+3` for A/B/C; `Ctrl+4`, `Ctrl+5`, or `Ctrl+6` for A+A/B+B/C+A; and `Ctrl+0` to disable Anime4K. Every change displays on screen for three seconds. These mappings match the [official Anime4K high-end template](https://github.com/bloc97/Anime4K/blob/master/md/Template/GLSL_Windows_High-end/input.conf).

Resume progress flows in both directions: the website passes its saved position to MPV, and MPV reports its current position back to local storage and signed-in account progress while it runs and when it closes. The persistent **Stop MPV** button is a recovery control that closes every process using the configured executable, including an orphan left by a server restart.

This integration is intentionally local: a hosted Next.js server cannot open a native MPV window on a visitor's computer. On Windows, start Next.js from the signed-in desktop session (for example, a normal or minimized terminal); a server running as a service or on a hidden desktop cannot display MPV on the user's desktop. Hosted deployments continue to use the browser player.

For a production-mode local run:

```bash
npm run build
npm start
```

## Docker

Create `.env.local` as described above, then run:

```bash
docker compose --env-file .env.local up --build
```

Open `http://localhost:3000`. The Compose configuration stores SQLite data in the named `anime-cloud-data` volume, so accounts, libraries, progress and synchronization state survive container recreation.

To build and run without Compose:

```bash
docker build -t anime-cloud-web .
docker run --rm \
  --name anime-cloud-web \
  -p 3000:3000 \
  --env-file .env.local \
  -e DATABASE_PATH=/app/data/anime-cloud.sqlite \
  -v anime-cloud-data:/app/data \
  anime-cloud-web
```

Stop Compose with `docker compose down`. Add `-v` only when you intentionally want to delete the persistent database volume. Use the same `--env-file .env.local` option for other Compose commands when they need your configured values.

## Environment variables

| Variable | Purpose |
|---|---|
| `LEGACY_CATALOG_URL` | Catalog, schedule, episodes and playback gateway |
| `LEGACY_ACCOUNT_URL` | Login and account gateway |
| `LEGACY_BACKUP_URL_TEMPLATE` | Server-only legacy SQLite backup URL template |
| `LEGACY_PLAYBACK_PASSWORD` | Server-only RNCryptor playback password |
| `SESSION_SECRET` | Encrypts legacy account identifiers in the HTTP-only session cookie |
| `DATABASE_PATH` | SQLite database used for middleware-owned features |
| `MPV_PATH` | Optional path to `mpv.exe` or `mpvnet.exe`; defaults to `mpv` |
| `ANIME4K_SHADER_DIR` | Optional directory containing the complete high-end Anime4K GLSL set |
| `MPV_TLS_VERIFY` | Set to `no` only for a video host whose TLS certificate MPV cannot validate |

Never prefix secrets with `NEXT_PUBLIC_`. The browser only calls this project's `/api/*` routes.

AniList OAuth credentials are configured per signed-in account on the website’s Account page. The client secret is encrypted in the server-side database and is never returned to the browser. Register the callback URL shown on that page in AniList Developer Settings before connecting.

## Backend routes

```text
GET  /api/home
GET  /api/catalog?q=...
GET  /api/anime/:id
POST /api/episodes/:id/source
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/signup
POST /api/auth/recover
GET  /api/me
PATCH /api/profile
GET|POST|PATCH|DELETE /api/comments
POST /api/comments/:id/reaction
GET  /api/library
PUT  /api/library/:animeId
PUT  /api/episodes/:id/progress
POST /api/library/sync
GET  /api/anilist/connect
GET  /api/anilist/callback
GET|POST|DELETE /api/anilist/config
GET|DELETE /api/anilist/status
POST /api/anilist/sync
POST /api/recommendations
GET|POST|DELETE /api/player/mpv
```

The legacy gateways remain irregular form-encoded PHP endpoints. `app/api/_legacy.ts` is the normalization boundary; the React client only receives stable JSON. The middleware database stores only web-owned state and synchronization metadata; the existing services remain authoritative for their original features.

The first legacy or AniList sync is download-only. Later syncs upload only after a baseline exists. Local removals are retained as tombstones so an older remote backup cannot silently restore them.

## Production

Run `npm run build` before deployment. Any standard Next.js host or Node server can run the production build with `npm start`. Configure the required environment variables in the host's server-side secret settings.

For a horizontally scaled deployment, place `DATABASE_PATH` on durable shared storage or replace `app/api/_db.ts` with a managed SQL adapter. The in-memory rate limiter is suitable for one Node process; use Redis or an edge rate-limit service when running multiple instances.
