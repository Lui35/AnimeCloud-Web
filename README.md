# Anime Cloud Web

A standalone Next.js web client and backend proxy for the recovered Anime Cloud 6.5 services. It is not tied to ChatGPT hosting or authentication and can be deployed on any Node.js platform that supports Next.js.

## Included

- Cinematic, responsive English web client
- Server-side proxy for the legacy catalog gateway
- Cached search across the 2,500+ title catalog
- Home, schedule, new episodes and anime-detail APIs
- RNCryptor-compatible playback decryption on the server
- Legacy account login through an encrypted, HTTP-only session cookie
- Device-local My List storage
- Social preview metadata and artwork

## Local setup

1. Install Node.js 22 or newer.
2. Copy `.env.example` to `.env.local`.
3. Set a random `SESSION_SECRET` with at least 32 characters.
4. Set `LEGACY_PLAYBACK_PASSWORD` if playback should be enabled.
5. Start the application:

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
| `LEGACY_PLAYBACK_PASSWORD` | Server-only RNCryptor playback password |
| `SESSION_SECRET` | Encrypts legacy account identifiers in the HTTP-only session cookie |

Never prefix secrets with `NEXT_PUBLIC_`. The browser only calls this project's `/api/*` routes.

## Backend routes

```text
GET  /api/home
GET  /api/catalog?q=...
GET  /api/anime/:id
POST /api/episodes/:id/source
POST /api/auth/login
POST /api/auth/logout
GET  /api/me
```

The legacy gateways remain irregular form-encoded PHP endpoints. `app/api/_legacy.ts` is the normalization boundary; the React client only receives stable JSON.

## Production

Run `npm run build` before deployment. Any standard Next.js host or Node server can run the production build with `npm start`. Configure all four environment variables in the host's server-side secret settings.

