# Deployment Guide — Cloudflare, No Purchased Domain

You can run the whole site (frontend + API) on **one free Cloudflare Workers subdomain**
(`https://<project>.<account>.workers.dev`) — exactly like your old setup — or use the
split Pages + Worker architecture. HTTPS is automatic and free on both.

---

## Option A (recommended): Single Worker — everything on `*.workers.dev`

A Node HTTP server cannot run *inside* a classic JS Worker, so for one-origin deploys
of this codebase use **Cloudflare Containers / Node.js runtime (Workers with containers)**
or any small VPS/PaaS behind Cloudflare DNS-free. Simplest guaranteed-compatible paths:

### A1. Deploy to a Node host + Cloudflare in front (closest to current code)
1. Host `npm start` anywhere Node 20 runs: Render, Railway, Fly.io, Hetzner/VPS, or a free-tier VM.
2. Point that origin at the app (env vars below).
3. If you own the origin domain, add it to Cloudflare DNS (proxied ☁️). For a purchased-domain-free setup, prefer A2 or B.

Required production env vars:
```
NODE_ENV=production
PORT=<host-assigned port>
JWT_SECRET=$(openssl rand -hex 32)
ADMIN_EMAIL=you@yourmail.com
ADMIN_PASSWORD=<strong unique password>
CORS_ORIGINS=https://<your-pages-or-workers-url>
SERVE_WEB=true          # single-origin mode; set false if frontend lives on Pages
CF_ZONE_ID=<optional>   # enables edge purge from the dashboard
CF_API_TOKEN=<optional> # token scoped to "Zone.Cache Purge" for your zone
DB_FILE=/data/titanium.db   # put on a persistent volume, NOT ephemeral disk
```
Seed once on deploy: `npm run seed` (idempotent — safe to re-run).

### A2. Pure Cloudflare: Pages (frontend) + D1 + Worker (API port)
The repository layer isolates all SQL in `db/repository.js`, so porting the API to a
**Worker + D1** (Cloudflare's serverless SQLite) keeps your no-domain workers.dev URL:
1. `wrangler d1 create titanium-army`
2. Copy `apps/api/src/db/schema.sql` → apply with `wrangler d1 migrations apply titanium-army --remote`.
3. Re-implement `repository.js` with `env.DB.prepare(...)` bindings (queries are already parameterized).
4. Port routes to `export default { fetch(request, env) }` (Fastify → WorkOS MiniFlask/Hono recommended for Workers).
5. `wrangler pages deploy dist` (from `npm run build`) for the static site; bind the Worker under the same Pages project via a `/api/*` proxy or use the Worker's own `*.workers.dev` URL and set `CORS_ORIGINS` accordingly.

## Option B: Cloudflare Pages only (static demo mode)
If you ever want zero backend, `npm run build` produces `dist/` you can drag into
Pages (`app.netlify`-style direct upload) — but you lose the admin DB. Not recommended.

---

## Build & Deploy Commands

```bash
npm ci
npm run build            # → dist/ (index.html, admin/, assets/, robots.txt, sitemap.xml)
npm run seed             # first time / after schema changes
NODE_ENV=production npm start
```

## Cloudflare Dashboard Configuration

### Cache Rules (critical for heavy traffic)
Create a **Cache Rule** named `API edge cache`:
- Field: `URI Path` starts with `/api/public/` **or** `/api/health`
- Eligibility for cache: **Eligible**
- Browser TTL: 60 s · Edge TTL: **5 minutes** (matches `s-maxage=300` sent by the API)
- Respect existing response headers ✔ (the API already sends correct `Cache-Control`)

Second rule `Never cache admin`:
- URI Path starts with `/api/admin/` or `/api/auth/` → **Bypass cache**.

### Security
- Speed → Optimization: Brotli ON.
- Scrape Shield / Bot Fight Mode ON.
- WAF custom rule: rate-limit `/admin*` and `/api/auth/login` (e.g. >10/min → managed challenge). This complements the app's own limiter (`RATE_LIMIT_AUTH_MAX=10`).
- SSL/TLS mode: **Full (strict)** when origin supports HTTPS.

### Purging after content edits
The dashboard calls `POST /api/cache/purge` automatically. With `CF_ZONE_ID` +
`CF_API_TOKEN` set it purges the edge instantly; without them, edits appear within
≤5 minutes (edge TTL) while the origin micro-cache clears immediately. Manual purge:
Cloudflare dashboard → Caching → **Purge Everything** (or purge by URL prefix `/api/public/*`).

## Backups & Persistence

- SQLite file (`DB_FILE`) is the entire database. Back it up with:
  `sqlite3 data/titanium.db ".backup backups/titanium-$(date +%F).db"` (cron daily; keep 14).
- WAL mode means `-wal`/`-shm` sidecar files exist while running — back up via `.backup` (as above), never by raw copy mid-write.
- On hosts without persistent disks, mount a volume (Render/Railway/Fly all support this) or migrate to D1/Postgres (§7 of README).

## Health Checks / Monitoring
- Uptime monitor against `GET /api/health` (returns `{status:"ok"}`) — Cloudflare has a free health-check cron trigger.
- Logs are JSON (pino) → pipe into whatever log service your host provides.

## Rollback
Deploy the previous release tag; the schema uses only additive `CREATE TABLE IF NOT EXISTS`
migrations, so old data always loads on newer code. Never drop columns in-place — add new ones.

---

## Cloudflare Pages — Quick Deploy (this repo: `attrim27/First-repo`)

**Production branch:** `main` · **Framework:** None · **Node version env var:** `NODE_VERSION = 20`

| Setting | Value |
|---|---|
| Build command | `npm run pages:build` |
| Build output directory | `dist` |
| Root directory | `public` (holds `_headers` + `_redirects`) |
| Env vars | `NODE_VERSION=20` |

`npm run pages:build` bundles `apps/web → dist/`, copies edge headers into `dist/_headers`, and generates `public/_redirects` that proxies `/api/*` to the Workers API origin (`first-project.attrim27-16d.workers.dev`) with a path-preserving splat rule. Pushes to `main` auto-deploy; every PR gets a preview URL.

API side (Workers + D1): create the D1 database, paste its id into `wrangler.toml`, apply `worker/schema.sql` + seed, set `JWT_SECRET`, then `npm run deploy:worker`. See Option A2 above for the full walkthrough.
