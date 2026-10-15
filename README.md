# Titanium Army — v2 (Modern Full-Stack Rebuild)

Fan-made extreme science showcase, rebuilt from the original static IIS site into a
**real full-stack application**: Fastify API + SQLite backend, dynamic frontend, and a
secure JWT-authenticated admin dashboard. Designed to sit behind Cloudflare with **no
purchased domain required** (works on `*.workers.dev` / Cloudflare Pages).

---

## 1. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Runtime | Node.js ≥ 20 (ESM) | `engines` enforced in package.json |
| API framework | **Fastify 4** | Plugin architecture, ~2× Express throughput |
| Database | **SQLite** via `better-sqlite3` (WAL mode) | Zero-config; swap to Postgres/MySQL/D1 by editing one file (see §7) |
| Auth | **JWT** (`@fastify/jwt`) + **bcryptjs** password hashing | Server-side truth replaces the old localStorage demo |
| Security | `@fastify/helmet`, CORS allow-list, tiered rate limiting | See §6 |
| Compression | `@fastify/compress` (brotli + gzip) | |
| Frontend | Static HTML/CSS/JS ES-modules in `apps/web` | No build step, SEO meta/OG/JSON-LD, works progressively |
| CDN / Hosting | Cloudflare Pages (frontend) + Workers or any Node host (API) | Deployment guide: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) |

## 2. Project Structure

```
apps/
  api/src/
    config.js               # ALL env vars live here — single source of truth
    app.js                  # Fastify app factory (plugins + routes + static)
    server.js               # Entry point, graceful shutdown
    db/
      schema.sql            # All SQL DDL in one portable file
      index.js              # Connection + WAL pragmas + migrations runner
      repository.js         # ONLY place that touches SQL queries (swap DB here)
      seed.js               # npm run seed — creates admin + demo content
    plugins/
      security.js           # helmet, CORS, compress, rate-limit tiers
      auth.js               # app.authenticate (JWT) + app.authorize(...roles)
    routes/
      index.js              # Route hub — register new modules here
      auth.routes.js        # login / me / change-password
      public.routes.js      # cached read endpoints for the website
      admin.routes.js       # CRUD: videos, content, settings, users, overview
      cache.routes.js       # POST /api/cache/purge (origin + Cloudflare edge)
    services/
      cache.js              # in-process micro-cache (TTL map)
      slug.js               # URL-safe slug generator
  web/                      # The public site + admin dashboard (static)
    index.html  assets/  admin/  robots.txt  sitemap.xml  site.webmanifest
scripts/copy-frontend.mjs   # npm run build → dist/ for Cloudflare Pages
legacy/                     # Your original IIS files (kept for reference)
data/titanium.db            # SQLite database (gitignored)
docs/                       # DEPLOYMENT.md, API.md, MAINTENANCE.md
```

## 3. Quick Start

```bash
npm install          # installs root + workspace deps
npm run seed         # creates data/titanium.db + default admin account
npm start            # http://localhost:8787  (site + dashboard + API, one origin)
```

Development with auto-reload: `npm run dev` (uses `node --watch`).

Open:
- Site: `http://localhost:8787/`
- Dashboard: `http://localhost:8787/admin/`

**Default admin:** `admin@titaniumarmy.test` / `Admin@123`
⚠️ **Change it immediately** (dashboard → Settings → *Change my password*) and set
`JWT_SECRET` + `ADMIN_PASSWORD` env vars before deploying anywhere public.

## 4. Scripts

| Command | What it does |
|---|---|
| `npm start` | Run the API + serve the frontend (production mode) |
| `npm run dev` | Same, with file-watch auto restart |
| `npm run seed` | Create/migrate DB and idempotently seed admin + demo rows |
| `npm run build` | Copy `apps/web` → `dist/` (deployable static bundle for Pages) |
| `npm test` | Run API tests (`node --test apps/api/tests`) |

## 5. Using the Admin Dashboard

Login at `/admin/`. Roles: **admin** (everything incl. user management), **editor**
(content/videos/settings, no users), **member** (no dashboard access).

- **Overview** — video/user counts, recent activity.
- **Videos** — create/edit/delete, publish/draft toggle, ordering, categories.
- **Content** — homepage hero/about/stats text stored in DB (site updates without code changes).
- **Users** — invite (set initial password), change role, activate/deactivate, remove.
- **Settings** — site name, accent color, SEO description; change-your-password.
- Every save automatically calls `POST /api/cache/purge` so edits appear live instantly.

## 6. Configuration Reference (`apps/api/src/config.js`)

| Env var | Default | Purpose |
|---|---|---|
| `PORT` / `HOST` | `8787` / `0.0.0.0` | Listen address |
| `NODE_ENV` | `development` | `production` tightens cookie/log behavior |
| `JWT_SECRET` | dev placeholder | **Must** be a long random string in prod |
| `JWT_EXPIRES_IN` | `12h` | Session lifetime |
| `BCRYPT_ROUNDS` | `10` | Password hash cost |
| `DB_FILE` | `data/titanium.db` | SQLite path |
| `RATE_LIMIT_GLOBAL_MAX` / `_WINDOW_MS` | `1000` / `60000` | Public API per IP |
| `RATE_LIMIT_AUTH_MAX` / `_WINDOW_MS` | `10` / `60000` | Login attempts per IP (brute-force shield; raise if you get 429s during testing) |
| `SERVE_WEB` / `WEB_ROOT` | `true` / `apps/web` | Single-origin mode off/on |
| `CORS_ORIGINS` | localhost | Extra allowed origins (comma-separated) when frontend & API are split |
| `ADMIN_EMAIL/PASSWORD/NAME` | demo values | Seeded first admin |
| `CF_ZONE_ID` / `CF_API_TOKEN` | unset | Enables real Cloudflare edge purge in `/api/cache/purge` |
| `LOG_LEVEL` | `info` | pino level |

## 7. Extending the Backend (modular by design)

**Add a new resource (e.g. "articles"):**
1. Add table to `apps/api/src/db/schema.sql` → re-run `npm run seed` (migrations are idempotent).
2. Add a `repo.articles = { list/get/create/update/remove }` block in `db/repository.js` (prepared statements).
3. Create `routes/articles.routes.js` following `admin.routes.js`, register it in `routes/index.js`.
4. Optionally add a public cached GET in `public.routes.js` and a section in `apps/web/admin/admin.js`.

**Swap SQLite → Postgres/MySQL/Cloudflare D1:** only `db/index.js` + `db/repository.js`
contain SQL/driver code; routes/plugins never touch the DB directly.

## 8. Performance Under Heavy Traffic

1. **Cloudflare edge caching** — public API responses send `cache-control: public, s-maxage=300, stale-while-revalidate=600`; most requests never reach your origin.
2. **Origin micro-cache** (30 s TTL in `services/cache.js`) shields SQLite even on cache misses.
3. **WAL-mode SQLite** — unlimited concurrent readers, fast writes; prepared statements everywhere.
4. **Brotli/gzip**, lazy-loaded images, tiny dependency footprint, no frontend build bloat.
See `docs/DEPLOYMENT.md` §Cache Rules for exact Cloudflare configuration.

## 9. SEO & Frontend Notes

- Semantic HTML, per-page `<title>`/meta description, Open Graph + Twitter cards, JSON-LD (`Organization` + `WebSite`), `sitemap.xml`, `robots.txt`, PWA manifest.
- Homepage renders meaningful content without JS (progressive enhancement); particles/counters/reveal animations respect `prefers-reduced-motion` and pause on hidden tabs.

## 10. Documentation Index

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Cloudflare Workers/Pages deploy, DNS-less setup, cache rules, backups, HTTPS.
- [`docs/API.md`](docs/API.md) — every endpoint with request/response examples.
- [`docs/MAINTENANCE.md`](docs/MAINTENANCE.md) — day-to-day: content updates, users, resets, troubleshooting (incl. 429 rate limits).
- [`legacy/README.md`](legacy/README.md) — the original IIS site (reference only).

## 11. Security Checklist Before Going Live

- [ ] Set strong random `JWT_SECRET` (`openssl rand -hex 32`)
- [ ] Change the seeded admin password
- [ ] Set production `ADMIN_EMAIL`/`ADMIN_PASSWORD` before first seed on the server
- [ ] `NODE_ENV=production`, real HTTPS (Cloudflare provides this free on workers.dev/Pages)
- [ ] Restrict `CORS_ORIGINS` to your actual deployed origins
- [ ] Enable Cloudflare WAF/Bot Fight Mode for `/admin/*` (see DEPLOYMENT.md)
