// ---------------------------------------------------------------------------
// Repository layer — the ONLY module that touches SQL.
// Routes/services never write SQL directly, so swapping SQLite for
// Postgres/MySQL/KV later means editing just this file.
// ---------------------------------------------------------------------------
import { getDb } from "./index.js";

const rowToVideo = (r) => r && ({
  id: r.id, title: r.title, slug: r.slug, category: r.category,
  description: r.description, url: r.url, thumbnail: r.thumbnail,
  status: r.status, viewsLabel: r.views_label, sortOrder: r.sort_order,
  createdAt: r.created_at, updatedAt: r.updated_at
});

const rowToUser = (r) => r && ({
  id: r.id, name: r.name, email: r.email, role: r.role,
  active: !!r.active, createdAt: r.created_at, updatedAt: r.updated_at
});

export const videos = {
  list({ publishedOnly = false, category } = {}) {
    let sql = "SELECT * FROM videos";
    const where = [], params = {};
    if (publishedOnly) { where.push("status = 'published'"); }
    if (category) { where.push("category = @category"); params.category = category; }
    if (where.length) sql += " WHERE " + where.join(" AND ");
    sql += " ORDER BY sort_order ASC, id DESC";
    return getDb().prepare(sql).all(params).map(rowToVideo);
  },
  byId(id) {
    return rowToVideo(getDb().prepare("SELECT * FROM videos WHERE id = ?").get(id));
  },
  create(v) {
    const info = getDb().prepare(`INSERT INTO videos
      (title, slug, category, description, url, thumbnail, status, views_label, sort_order)
      VALUES (@title, @slug, @category, @description, @url, @thumbnail, @status, @viewsLabel, @sortOrder)`
    ).run({
      title: v.title, slug: v.slug, category: v.category ?? "EXTREME SCIENCE",
      description: v.description ?? "", url: v.url ?? "", thumbnail: v.thumbnail ?? "",
      status: v.status ?? "published", viewsLabel: v.viewsLabel ?? "—", sortOrder: v.sortOrder ?? 0
    });
    return this.byId(info.lastInsertRowid);
  },
  update(id, v) {
    const existing = this.byId(id);
    if (!existing) return null;
    getDb().prepare(`UPDATE videos SET title=@title, slug=@slug, category=@category,
      description=@description, url=@url, thumbnail=@thumbnail, status=@status,
      views_label=@viewsLabel, sort_order=@sortOrder, updated_at=datetime('now') WHERE id=@id`
    ).run({ ...existing, ...v, id: Number(id) });
    return this.byId(id);
  },
  remove(id) {
    return getDb().prepare("DELETE FROM videos WHERE id = ?").run(id).changes > 0;
  },
  count({ status } = {}) {
    if (status) return getDb().prepare("SELECT COUNT(*) n FROM videos WHERE status=?").get(status).n;
    return getDb().prepare("SELECT COUNT(*) n FROM videos").get().n;
  }
};

export const users = {
  list() {
    return getDb().prepare("SELECT * FROM users ORDER BY id ASC").all().map(rowToUser);
  },
  byId(id) {
    return rowToUser(getDb().prepare("SELECT * FROM users WHERE id = ?").get(id));
  },
  byEmail(email) {
    const r = getDb().prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(email);
    if (!r) return null;
    return { ...rowToUser(r), passwordHash: r.password_hash };
  },
  create(u) {
    const info = getDb().prepare(
      "INSERT INTO users (name, email, password_hash, role, active) VALUES (?,?,?,?,?)"
    ).run(u.name, u.email.toLowerCase(), u.passwordHash, u.role ?? "member", u.active === false ? 0 : 1);
    return this.byId(info.lastInsertRowid);
  },
  update(id, patch) {
    const fields = [];
    const params = { id: Number(id) };
    const map = { name: "name", email: "email", role: "role", passwordHash: "password_hash" };
    if ("active" in patch) { fields.push("active=@active"); params.active = patch.active ? 1 : 0; }
    for (const [k, col] of Object.entries(map)) {
      if (patch[k] !== undefined) { fields.push(`${col}=@${k}`); params[k] = k === "email" ? String(patch[k]).toLowerCase() : patch[k]; }
    }
    if (fields.length) {
      fields.push("updated_at=datetime('now')");
      getDb().prepare(`UPDATE users SET ${fields.join(", ")} WHERE @id`).run(params);
    }
    return this.byId(id);
  },
  remove(id) {
    return getDb().prepare("DELETE FROM users WHERE id = ?").run(id).changes > 0;
  },
  count() {
    return getDb().prepare("SELECT COUNT(*) n FROM users").get().n;
  }
};

function kvTable(table) {
  return {
    all() {
      const rows = getDb().prepare(`SELECT key, value FROM ${table}`).all();
      return Object.fromEntries(rows.map(r => [r.key, JSON.parse(r.value)]));
    },
    setMany(obj) {
      const stmt = getDb().prepare(
        `INSERT INTO ${table} (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
      );
      getDb().transaction(() => {
        for (const [k, v] of Object.entries(obj)) stmt.run(k, JSON.stringify(v));
      })();
      return this.all();
    }
  };
}

export const content = kvTable("content");
export const settings = kvTable("settings");

export default { videos, users, content, settings };
