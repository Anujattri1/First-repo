# Maintenance Guide — Day-to-Day Operations

Everything you can change **without touching code** lives in the admin dashboard
(`/admin/`). This doc covers routine tasks and troubleshooting.

## Common Tasks

### Update homepage text / hero / stats
Dashboard → **Content**. Values save to the DB; the site fetches them from
`/api/public/content` on load. Purge runs automatically, so changes are live
immediately at the origin and within ≤5 min at the Cloudflare edge (or instantly if
`CF_ZONE_ID`/`CF_API_TOKEN` are configured).

### Add a video
Dashboard → **Videos → New**. Only *Title* is required; slug is generated from the title.
Set status `draft` to hide it from the public site. Use `sort_order` (lower = earlier) to control ordering.

### Branding / SEO tweaks
Dashboard → **Settings**: site name, accent color, SEO description. After changing the
SEO description, also update `<meta name="description">`/OG tags in `apps/web/index.html`
if you want static HTML to match (the JSON-LD block reads the same copy).

### Manage team members
Dashboard → **Users** (admin role only): add with an initial password, promote to
`editor` for content-only access, deactivate instead of deleting when someone leaves
(preserves audit trail). Never delete the last active admin.

## Resetting / Recovering

| Situation | Fix |
|---|---|
| Lost admin password | With DB access: run seed script after setting env `ADMIN_PASSWORD` — seed updates the seeded email's password hash. Or via another admin account through Users → edit. |
| Corrupt/dev DB reset | Stop server → delete `data/titanium.db*` → `npm run seed` → restart. ⚠️ Destroys all data; back up first. |
| JWT secret rotation | Change `JWT_SECRET`, redeploy/restart. All sessions log out (tokens become invalid) — intended behavior. |

## Troubleshooting

**HTTP 429 on login (`Too many requests`)** — the brute-force limiter (`RATE_LIMIT_AUTH_MAX`, default 10/min/IP). Wait ~60 s. During automated testing locally, raise it: `RATE_LIMIT_AUTH_MAX=50 npm start`.

**Admin edits don't appear on the public site** — order of caches: browser (hard refresh Ctrl+Shift+R) → origin micro-cache (cleared by purge) → Cloudflare edge (up to 5 min TTL; use dashboard purge or Caching → Purge URL prefix `/api/public/*`).

**`GET /api/admin/*` returns 401** — token expired (`JWT_EXPIRES_IN`, default 12 h). Log out/in at `/admin/`.

**Site loads but lists are empty** — check API is reachable: open `/api/health`. If frontend and API are split across hosts, verify `CORS_ORIGINS` includes the exact frontend origin (scheme + host, no trailing slash).

**`database is locked` errors** — should not happen (WAL mode); if seen after moving `DB_FILE` to a network filesystem, move it back to local/persistent disk. SQLite needs a POSIX-local volume.

**Server won't start: port in use** — set `PORT` env var or stop the other process (`lsof -i :8787`).

## Performance Checks
- Confirm edge caching works: `curl -sI https://yoursite/api/public/videos` twice — second response should show `cf-cache-status: HIT`.
- Watch origin CPU/latency under traffic; the limiter logs 429s in pino output.
- Keep the DB tidy: drafts and unused videos cost nothing, but avoid storing large base64 blobs in content fields — host images/thumbnails externally (Cloudflare Images/R2/YouTube thumbnails).

## Updating Dependencies Safely
```bash
npm outdated                 # review
npm install <pkg>@<newver> -w @ta/api
npm test && npm run seed     # verify against a fresh DB copy
```
Fastify major versions occasionally change plugin APIs — update one plugin family at a time and re-run the smoke tests in docs/API.md curl examples.

## Where to Look in Code
| You want to… | File |
|---|---|
| Change port/env defaults | `apps/api/src/config.js` |
| Add SQL/columns | `apps/api/src/db/schema.sql` (+ repository query) |
| Add an endpoint | `apps/api/src/routes/*.routes.js` → register in `routes/index.js` |
| Adjust rate limits/security headers | `apps/api/src/plugins/security.js` |
| Change auth/roles logic | `apps/api/src/plugins/auth.js` |
| Edit dashboard UI | `apps/web/admin/index.html` + `admin.js` |
| Edit public site | `apps/web/index.html`, `assets/style.css`, `assets/main.js` |
