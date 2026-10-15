// ---------------------------------------------------------------------------
// Shared API handler — ONE codebase, TWO runtimes.
//   * Node (Fastify): apps/api/src/server.js wraps this handler per request.
//   * Cloudflare Workers: worker/index.js calls it directly with env bindings
//     (D1 database + KV rate-limit namespace).
// All data access goes through the `db` object (prepare()/transaction()), so
// both better-sqlite3 and D1 work without changes to route logic.
// ---------------------------------------------------------------------------
import { hashPassword, verifyPassword, signJwt, verifyJwt } from "./crypto.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
  "access-control-max-age": "86400"
};
const PUBLIC_CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

function json(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...CORS_HEADERS, ...headers } });
}
const err = (status, message) => json({ error: httpName(status), message }, { status });
function httpName(code) {
  return { 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 409: "Conflict", 429: "Too Many Requests" }[code] || "Error";
}

const nowIso = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

// ---------- helpers over the db binding (works for BOTH D1 and Node) --------
// isD1: true on Cloudflare (env.DB); false in the Node wrapper (we pass a
// better-sqlite3 database + array params adapted to its sync API).
async function all(db, sql, ...p) {
  if (db.isNodeSqlite) return db.inner.prepare(sql).all(p[0] ?? {});
  return (await db.prepare(sql).bind(...p).all()).results;
}
async function get(db, sql, ...p) {
  if (db.isNodeSqlite) return db.inner.prepare(sql).get(p[0] ?? {});
  return (await db.prepare(sql).bind(...p).first());
}
async function run(db, sql, ...p) {
  if (db.isNodeSqlite) return db.inner.prepare(sql).run(toNamedParams(sql, p));
  return db.prepare(sql).bind(...p).run();
}
// better-sqlite3 needs named params when SQL uses @name placeholders; positional
// arrays work for ? placeholders. Our handler SQL uses ?, so just pass the array.
function toNamedParams(_sql, params) { return params; }

const rowToVideo = (r) => r && ({
  id: r.id, title: r.title, slug: r.slug, category: r.category, description: r.description,
  url: r.url, thumbnail: r.thumbnail, status: r.status, viewsLabel: r.views_label,
  sortOrder: r.sort_order, createdAt: r.created_at, updatedAt: r.updated_at
});
const rowToUser = (r) => r && ({ id: r.id, name: r.name, email: r.email, role: r.role, active: !!r.active, createdAt: r.created_at, updatedAt: r.updated_at });

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "item";
}
async function uniqueSlug(db, wanted, table, ignoreId = null) {
  let slug = slugify(wanted), i = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const q = ignoreId != null
      ? await get(db, `SELECT id FROM ${table} WHERE slug=? AND id<>?`, slug, ignoreId)
      : await get(db, `SELECT id FROM ${table} WHERE slug=?`, slug);
    if (!q) return slug;
    slug = `${slugify(wanted)}-${++i}`;
  }
}

// ---------- rate limiting (KV-backed, best-effort) --------------------------
async function rateLimit(env, key, max, windowMs) {
  if (!env.CACHE_KV) return true; // disabled when no KV bound (e.g. local node)
  try {
    const win = Math.floor(Date.now() / windowMs);
    const k = `rl:${key}:${win}`;
    const cur = Number((await env.CACHE_KV.get(k)) || 0);
    if (cur >= max) return false;
    await env.CACHE_KV.put(k, String(cur + 1), { expirationTtl: Math.ceil(windowMs / 1000) + 5 });
    return true;
  } catch { return true; }
}

// ---------- auth -------------------------------------------------------------
async function authenticate(env, request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const payload = await verifyJwt(token, env.JWT_SECRET || "change-me-in-production-dev-secret");
  if (!payload?.id) return null;
  const u = await get(env.DB, "SELECT * FROM users WHERE id=?", payload.id);
  if (!u || !u.active) return null;
  return { ...rowToUser(u) };
}

// ---------- route handlers ----------------------------------------------------
export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;

  if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const db = env.DB;
  if (!db) return err(500, "Database binding missing. Attach a D1 database named DB in wrangler.toml.");

  try {
    // ---- health ----
    if (path === "/api/health") return json({ status: "ok", time: nowIso() });

    // ---- public reads (edge-cacheable) ----
    if (path.startsWith("/api/public/") && method === "GET") {
      const cacheHdr = { "cache-control": PUBLIC_CACHE };
      if (path === "/api/public/videos") {
        const category = url.searchParams.get("category");
        const rows = category
          ? await all(db, "SELECT * FROM videos WHERE status='published' AND category=? ORDER BY sort_order ASC, id DESC", category)
          : await all(db, "SELECT * FROM videos WHERE status='published' ORDER BY sort_order ASC, id DESC");
        return json(rows.map(rowToVideo), { headers: cacheHdr });
      }
      if (path === "/api/public/content") return json(kvToObject(await all(db, "SELECT key,value FROM content")), { headers: cacheHdr });
      if (path === "/api/public/settings") {
        const allSettings = kvToObject(await all(db, "SELECT key,value FROM settings"));
        return json({ siteName: allSettings.siteName, accent: allSettings.accent, seoDescription: allSettings.seoDescription }, { headers: cacheHdr });
      }
      if (path === "/api/public/stats") {
        return json({
          videos: (await get(db, "SELECT COUNT(*) n FROM videos WHERE status='published'")).n,
          users: (await get(db, "SELECT COUNT(*) n FROM users")).n
        }, { headers: cacheHdr });
      }
      return err(404, "Unknown public endpoint.");
    }

    // ---- auth ----
    if (path === "/api/auth/login" && method === "POST") {
      if (!(await rateLimit(env, `login:${url.hostname}:${request.headers.get("cf-connecting-ip") || "local"}`, 10, 60_000))) {
        return err(429, "Too many login attempts. Try again in a minute.");
      }
      const body = await request.json().catch(() => ({}));
      const email = String(body.email || "").trim().toLowerCase();
      if (!email || !body.password) return err(400, "Email and password are required.");
      const u = await get(db, "SELECT * FROM users WHERE lower(email)=lower(?)", email);
      const ok = u && (await verifyPassword(String(body.password), u.password_hash));
      if (!ok || !u.active) return err(401, "Invalid credentials.");
      const token = await signJwt({ id: u.id, role: u.role, name: u.name }, env.JWT_SECRET || "dev-secret", 12 * 3600);
      return json({ token, user: rowToUser(u) });
    }

    if (path.startsWith("/api/auth/") || path.startsWith("/api/admin/") || path.startsWith("/api/cache")) {
      const me = await authenticate(env, request);
      if (!me) return err(401, "Valid session token required.");

      if (path === "/api/auth/me") return json({ user: me });

      if (path === "/api/auth/change-password" && method === "POST") {
        const b = await request.json().catch(() => ({}));
        if (!b.currentPassword || !b.newPassword || String(b.newPassword).length < 8) return err(400, "New password must be at least 8 characters.");
        const u = await get(db, "SELECT * FROM users WHERE id=?", me.id);
        if (!u || !(await verifyPassword(String(b.currentPassword), u.password_hash))) return err(401, "Current password is incorrect.");
        await run(db, "UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?", await hashPassword(String(b.newPassword)), me.id);
        return json({ message: "Password updated." });
      }

      // admin routes need roles
      const ROLES_WRITE = ["admin", "editor"];
      const needsWrite = path.startsWith("/api/admin/");
      const needsAdminOnly = /^\/api\/admin\/users/.test(path) || path === "/api/cache/purge";
      if (needsWrite && !ROLES_WRITE.includes(me.role)) return err(403, "Insufficient permissions for this action.");
      if (needsAdminOnly && me.role !== "admin") return err(403, "Admin role required.");

      // ---- videos CRUD ----
      if (path === "/api/admin/videos" && method === "GET") return json((await all(db, "SELECT * FROM videos ORDER BY sort_order ASC, id DESC")).map(rowToVideo));
      if (path === "/api/admin/videos" && method === "POST") {
        const b = await request.json().catch(() => ({}));
        if (!b.title || !String(b.title).trim()) return err(400, "Title is required.");
        const slug = await uniqueSlug(db, b.slug || b.title, "videos");
        const id = uid();
        await run(db, `INSERT INTO videos (id,title,slug,category,description,url,thumbnail,status,views_label,sort_order,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
          id, String(b.title).trim(), slug, b.category || "EXTREME SCIENCE", b.description || "", b.url || "", b.thumbnail || "",
          b.status === "draft" ? "draft" : "published", b.viewsLabel || "—", Number(b.sortOrder) || 0);
        return json(rowToVideo(await get(db, "SELECT * FROM videos WHERE id=?", id)), { status: 201 });
      }
      const videoMatch = path.match(/^\/api\/admin\/videos\/([\w-]+)$/);
      if (videoMatch) {
        const existing = await get(db, "SELECT * FROM videos WHERE id=?", videoMatch[1]);
        if (!existing) return err(404, "Video not found.");
        if (method === "PUT") {
          const b = await request.json().catch(() => ({}));
          if (b.title !== undefined && !String(b.title).trim()) return err(400, "Title cannot be empty.");
          const slug = b.slug || b.title ? await uniqueSlug(db, b.slug || b.title, "videos", existing.id) : existing.slug;
          await run(db, `UPDATE videos SET title=?,slug=?,category=?,description=?,url=?,thumbnail=?,status=?,views_label=?,sort_order=?,updated_at=datetime('now') WHERE id=?`,
            b.title ?? existing.title, slug, b.category ?? existing.category, b.description ?? existing.description,
            b.url ?? existing.url, b.thumbnail ?? existing.thumbnail,
            b.status ? (b.status === "draft" ? "draft" : "published") : existing.status,
            b.viewsLabel ?? existing.views_label, b.sortOrder !== undefined ? Number(b.sortOrder) : existing.sort_order, existing.id);
          return json(rowToVideo(await get(db, "SELECT * FROM videos WHERE id=?", existing.id)));
        }
        if (method === "DELETE") { await run(db, "DELETE FROM videos WHERE id=?", existing.id); return json({ message: "Video deleted." }); }
      }

      // ---- content & settings ----
      if (path === "/api/admin/content" && method === "GET") return json(kvToObject(await all(db, "SELECT key,value FROM content")));
      if (path === "/api/admin/content" && method === "PUT") return json(await kvUpsert(db, "content", await request.json().catch(() => ({}))));
      if (path === "/api/admin/settings" && method === "GET") return json(kvToObject(await all(db, "SELECT key,value FROM settings")));
      if (path === "/api/admin/settings" && method === "PUT") return json(await kvUpsert(db, "settings", await request.json().catch(() => ({}))));

      // ---- users (admin only) ----
      if (path === "/api/admin/users" && method === "GET") return json((await all(db, "SELECT * FROM users ORDER BY created_at ASC")).map(rowToUser));
      if (path === "/api/admin/users" && method === "POST") {
        const b = await request.json().catch(() => ({}));
        if (!b.name || !b.email || !b.password) return err(400, "Name, email and password are required.");
        if (String(b.password).length < 8) return err(400, "Password must be at least 8 characters.");
        if (await get(db, "SELECT id FROM users WHERE lower(email)=lower(?)", b.email)) return err(409, "A user with that email already exists.");
        const id = uid();
        await run(db, "INSERT INTO users (id,name,email,password_hash,role,active,created_at,updated_at) VALUES (?,?,?,?,?,1,datetime('now'),datetime('now'))",
          id, String(b.name).trim(), String(b.email).toLowerCase(), await hashPassword(String(b.password)), ["admin", "editor", "member"].includes(b.role) ? b.role : "member");
        return json(rowToUser(await get(db, "SELECT * FROM users WHERE id=?", id)), { status: 201 });
      }
      const userMatch = path.match(/^\/api\/admin\/users\/([\w-]+)$/);
      if (userMatch && (method === "PUT" || method === "DELETE")) {
        const target = await get(db, "SELECT * FROM users WHERE id=?", userMatch[1]);
        if (!target) return err(404, "User not found.");
        if (method === "DELETE") {
          if (target.id === me.id) return err(400, "You cannot delete your own account.");
          await run(db, "DELETE FROM users WHERE id=?", target.id);
          return json({ message: "User deleted." });
        }
        const b = await request.json().catch(() => ({}));
        if (b.role && !["admin", "editor", "member"].includes(b.role)) return err(400, "Invalid role.");
        const admins = await all(db, "SELECT id FROM users WHERE role='admin' AND active=1");
        const losingAdmin = target.role === "admin" && ((b.role && b.role !== "admin") || b.active === false);
        if (losingAdmin && admins.length <= 1) return err(400, "Cannot remove the last active admin.");
        const patch = {
          name: b.name ?? target.name,
          email: b.email ? String(b.email).toLowerCase() : target.email,
          role: b.role ?? target.role,
          active: b.active === undefined ? target.active : (b.active ? 1 : 0)
        };
        if (b.password) {
          if (String(b.password).length < 8) return err(400, "Password must be at least 8 characters.");
          await run(db, "UPDATE users SET password_hash=? WHERE id=?", await hashPassword(String(b.password)), target.id);
        }
        await run(db, "UPDATE users SET name=?,email=?,role=?,active=?,updated_at=datetime('now') WHERE id=?",
          patch.name, patch.email, patch.role, patch.active, target.id);
        return json(rowToUser(await get(db, "SELECT * FROM users WHERE id=?", target.id)));
      }

      // ---- overview ----
      if (path === "/api/admin/overview" && method === "GET") {
        const [pub, draft, total, users, recent] = await Promise.all([
          get(db, "SELECT COUNT(*) n FROM videos WHERE status='published'"),
          get(db, "SELECT COUNT(*) n FROM videos WHERE status='draft'"),
          get(db, "SELECT COUNT(*) n FROM videos"),
          get(db, "SELECT COUNT(*) n FROM users"),
          all(db, "SELECT title,status,updated_at FROM videos ORDER BY updated_at DESC LIMIT 5")
        ]);
        return json({ publishedVideos: pub.n, draftVideos: draft.n, totalVideos: total.n, users: users.n, recentActivity: recent.map(r => ({ type: "video", title: r.title, status: r.status, at: r.updated_at })) });
      }

      // ---- cache purge (KV markers + optional CF purge via API token) ----
      if (path === "/api/cache/purge" && method === "POST") {
        let purged = false;
        if (env.CACHE_KV) { await env.CACHE_KV.put("purge-all", nowIso(), { expirationTtl: 3600 }); purged = true; }
        return json({ message: purged ? "Purge marker set." : "No KV binding; nothing to purge.", purged });
      }
    }

    return err(404, "Route not found: " + method + " " + path);
  } catch (e) {
    console.error("handler error:", e);
    return err(500, "Internal server error.");
  }
}

function kvToObject(rows) {
  const out = {};
  for (const r of rows) { try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; } }
  return out;
}
async function kvUpsert(db, table, obj) {
  for (const [k, v] of Object.entries(obj || {})) {
    await run(db, `INSERT INTO ${table} (key,value,updated_at) VALUES (?,?,datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`, k, JSON.stringify(v));
  }
  return kvToObject(await all(db, `SELECT key,value FROM ${table}`));
}

export default { fetch: handleRequest };
