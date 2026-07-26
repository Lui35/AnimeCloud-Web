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
- Rate limiting, input validation and security headers
- Social preview metadata and artwork

## Local setup

1. Install Node.js 22 or newer.
2. Copy `.env.example` to `.env.local`.
3. Set a random `SESSION_SECRET` with at least 32 characters.
4. Set `LEGACY_PLAYBACK_PASSWORD` if playback should be enabled.
5. Create an AniList OAuth client and set its three variables if AniList sync should be enabled.
6. Start the application:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

| Variable | Purpose |
|---|---|
| `LEGACY_CATALOG_URL` | Catalog, schedule, episodes and playback gateway |
| `LEGACY_ACCOUNT_URL` | Login and account gateway |
| `LEGACY_BACKUP_URL_TEMPLATE` | Server-only legacy SQLite backup URL template |
| `LEGACY_PLAYBACK_PASSWORD` | Server-only RNCryptor playback password |
| `SESSION_SECRET` | Encrypts legacy account identifiers in the HTTP-only session cookie |
| `DATABASE_PATH` | SQLite database used for middleware-owned features |
| `ANILIST_CLIENT_ID` | AniList OAuth application ID |
| `ANILIST_CLIENT_SECRET` | AniList OAuth secret |
| `ANILIST_REDIRECT_URI` | AniList OAuth callback URL |

Never prefix secrets with `NEXT_PUBLIC_`. The browser only calls this project's `/api/*` routes.

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
GET|DELETE /api/anilist/status
POST /api/anilist/sync
POST /api/recommendations
```

The legacy gateways remain irregular form-encoded PHP endpoints. `app/api/_legacy.ts` is the normalization boundary; the React client only receives stable JSON. The middleware database stores only web-owned state and synchronization metadata; the existing services remain authoritative for their original features.

The first legacy or AniList sync is download-only. Later syncs upload only after a baseline exists. Local removals are retained as tombstones so an older remote backup cannot silently restore them.

## Production

Run `npm run build` before deployment. Any standard Next.js host or Node server can run the production build with `npm start`. Configure the required environment variables in the host's server-side secret settings.

For a horizontally scaled deployment, place `DATABASE_PATH` on durable shared storage or replace `app/api/_db.ts` with a managed SQL adapter. The in-memory rate limiter is suitable for one Node process; use Redis or an edge rate-limit service when running multiple instances.
