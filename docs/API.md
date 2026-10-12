# API Reference — Titanium Army v2

Base URL: `/api` · JSON in/out · Auth via `Authorization: Bearer <jwt>` header.
Obtain a token from `POST /api/auth/login`. All admin endpoints require a valid JWT;
user-management endpoints additionally require the **admin** role.

---

## Public (no auth, edge-cacheable: `s-maxage=300`)

### `GET /api/health`
`{ "status": "ok", "time": "ISO-8601" }` — for uptime monitors.

### `GET /api/public/videos?category=<name>`
Published videos (all, or filtered). Response: array of
```json
{ "id": 1, "title": "...", "slug": "...", "category": "EXTREME SCIENCE",
  "description": "...", "url": "...", "thumbnail": "...",
  "status": "published", "views_label": "—", "sort_order": 0 }
```

### `GET /api/public/content`
All homepage content rows as `{ key: value }` map (hero title, about text, stats labels…).

### `GET /api/public/settings`
Whitelisted subset only: `{ siteName, accent, seoDescription }`.

### `GET /api/public/stats`
`{ "videos": <published count>, "users": <count> }`

## Auth

### `POST /api/auth/login` 🔒 rate-limited (10/min/IP)
```json
{ "email": "admin@...", "password": "..." }
```
→ `200 { token, user: { id, name, email, role } }` · `401` bad credentials · `403` deactivated account · `429` too many attempts.

### `GET /api/auth/me` *(Bearer required)*
→ `{ user: { id, name, email, role } }`

### `POST /api/auth/change-password` *(Bearer required)*
`{ "currentPassword": "...", "newPassword": "..." }` → `200` or `400` (too short/wrong current password).

## Admin *(Bearer required; roles noted)*

| Method & Path | Role | Body / Notes |
|---|---|---|
| `GET /api/admin/overview` | admin/editor | counts + recent items for dashboard |
| `GET /api/admin/videos` | admin/editor | **all** videos incl. drafts |
| `POST /api/admin/videos` | admin/editor | `{ title, category?, description?, url?, thumbnail?, status?, views_label?, sort_order? }` → 201 (slug auto-generated) |
| `PUT /api/admin/videos/:id` | admin/editor | partial update of same fields → 200 / 404 |
| `DELETE /api/admin/videos/:id` | admin/editor | → 204 / 404 |
| `GET /api/admin/content` | admin/editor | all content keys |
| `PUT /api/admin/content` | admin/editor | `{ key: value, ... }` upsert map |
| `GET /api/admin/settings` | admin/editor | full settings map |
| `PUT /api/admin/settings` | admin/editor | `{ siteName?, accent?, seoDescription?, ... }` |
| `GET /api/admin/users` | **admin** | users without password hashes |
| `POST /api/admin/users` | **admin** | `{ name, email, password, role }` → 201 |
| `PUT /api/admin/users/:id` | **admin** | `{ name?, role?, active?, password? }` |
| `DELETE /api/admin/users/:id` | **admin** | cannot delete yourself (400) |

Every successful admin mutation triggers cache invalidation server-side and the
dashboard then calls purge below.

## Cache

### `POST /api/cache/purge` *(admin/editor, Bearer)*
Clears the origin micro-cache always; purges Cloudflare edge if `CF_ZONE_ID`/`CF_API_TOKEN` are set.
→ `200 { purged: true }` or `202 { purged: false, message }` (CF vars missing) or `502` on CF API error.

---

## Error Shape
Fastify default: `{ statusCode, error, message }`. Validation failures → `400`,
missing resources → `404`, auth → `401`, wrong role → `403`, limits → `429`.

## curl Examples
```bash
TOKEN=$(curl -s localhost:8787/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@titaniumarmy.test","password":"Admin@123"}' | jq -r .token)

curl -s localhost:8787/api/admin/videos -H "authorization: Bearer $TOKEN" | jq
curl -s -X POST localhost:8787/api/admin/videos -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"title":"New Experiment","url":"https://youtu.be/xxx"}'
```
