// ---------------------------------------------------------------------------
// /api/admin — protected CRUD for videos, content, settings and users.
// Every route requires a valid JWT; user management requires the admin role.
// Editors (role=editor) may manage videos/content/settings but not users.
// ---------------------------------------------------------------------------
import bcrypt from "bcryptjs";
import repo from "../db/repository.js";
import config from "../config.js";
import { uniqueSlug, slugify } from "../services/slug.js";
import { invalidate } from "../services/cache.js";

const ROLES_WRITE = ["admin", "editor"];

export default async function adminRoutes(app) {
  const guard = { preHandler: [app.authenticate, app.authorize(...ROLES_WRITE)] };
  const adminOnly = { preHandler: [app.authenticate, app.authorize("admin")] };

  // ---- Videos -------------------------------------------------------------
  app.get("/videos", guard, async () => repo.videos.list());

  app.post("/videos", guard, async (req, reply) => {
    const b = req.body ?? {};
    if (!b.title || !String(b.title).trim()) return reply.code(400).send({ error: "Bad Request", message: "Title is required." });
    const slug = uniqueSlug(b.slug || b.title, (s) => !!repo.videos.list().some((v) => v.slug === s));
    const video = repo.videos.create({ ...b, title: String(b.title).trim(), slug });
    invalidate("videos");
    return reply.code(201).send(video);
  });

  app.put("/videos/:id", guard, async (req, reply) => {
    const existing = repo.videos.byId(req.params.id);
    if (!existing) return reply.code(404).send({ error: "Not Found", message: "Video not found." });
    const patch = { ...req.body };
    delete patch.id;
    if (patch.title && !String(patch.title).trim()) return reply.code(400).send({ error: "Bad Request", message: "Title cannot be empty." });
    if (patch.slug) patch.slug = uniqueSlug(patch.slug, (s) => s !== existing.slug && repo.videos.list().some((v) => v.slug === s));
    const video = repo.videos.update(req.params.id, patch);
    invalidate("videos");
    return video;
  });

  app.delete("/videos/:id", guard, async (req, reply) => {
    const ok = repo.videos.remove(req.params.id);
    if (!ok) return reply.code(404).send({ error: "Not Found", message: "Video not found." });
    invalidate("videos");
    return { message: "Video deleted." };
  });

  // ---- Content & settings ---------------------------------------------------
  app.get("/content", guard, async () => repo.content.all());

  app.put("/content", guard, async (req) => {
    const next = repo.content.setMany(req.body ?? {});
    invalidate("content");
    return next;
  });

  app.get("/settings", guard, async () => repo.settings.all());

  app.put("/settings", guard, async (req) => {
    const next = repo.settings.setMany(req.body ?? {});
    invalidate("settings");
    return next;
  });

  // ---- Users (admin only) ---------------------------------------------------
  app.get("/users", adminOnly, async () => repo.users.list());

  app.post("/users", adminOnly, async (req, reply) => {
    const { name, email, role = "member", password } = req.body ?? {};
    if (!name || !email || !password) return reply.code(400).send({ error: "Bad Request", message: "Name, email and password are required." });
    if (String(password).length < 8) return reply.code(400).send({ error: "Bad Request", message: "Password must be at least 8 characters." });
    if (repo.users.byEmail(email)) return reply.code(409).send({ error: "Conflict", message: "A user with that email already exists." });
    const hash = await bcrypt.hash(String(password), config.bcryptRounds);
    const user = repo.users.create({ name, email, role, passwordHash: hash });
    return reply.code(201).send(user);
  });

  app.put("/users/:id", adminOnly, async (req, reply) => {
    const target = repo.users.byId(req.params.id);
    if (!target) return reply.code(404).send({ error: "Not Found", message: "User not found." });
    const patch = { ...req.body };
    if (patch.password) {
      if (String(patch.password).length < 8) return reply.code(400).send({ error: "Bad Request", message: "Password must be at least 8 characters." });
      patch.passwordHash = await bcrypt.hash(String(patch.password), config.bcryptRounds);
      delete patch.password;
    }
    if (patch.role && !["admin", "editor", "member"].includes(patch.role)) {
      return reply.code(400).send({ error: "Bad Request", message: "Invalid role." });
    }
    // Never let an admin demote/deactivate the last remaining admin.
    const admins = repo.users.list().filter((u) => u.role === "admin" && u.active);
    const losingAdmin = target.role === "admin" && (patch.role && patch.role !== "admin" || patch.active === false);
    if (losingAdmin && admins.length <= 1) {
      return reply.code(400).send({ error: "Bad Request", message: "Cannot remove the last active admin." });
    }
    const user = repo.users.update(req.params.id, patch);
    return user;
  });

  app.delete("/users/:id", adminOnly, async (req, reply) => {
    const target = repo.users.byId(req.params.id);
    if (!target) return reply.code(404).send({ error: "Not Found", message: "User not found." });
    if (target.id === req.profile.id) return reply.code(400).send({ error: "Bad Request", message: "You cannot delete your own account." });
    repo.users.remove(req.params.id);
    return { message: "User deleted." };
  });

  // ---- Overview metrics for the dashboard ----------------------------------
  app.get("/overview", guard, async () => ({
    publishedVideos: repo.videos.count({ status: "published" }),
    draftVideos: repo.videos.count({ status: "draft" }),
    totalVideos: repo.videos.count(),
    users: repo.users.count(),
    recentActivity: repo.videos.list().slice(0, 5).map((v) => ({
      type: "video", title: v.title, status: v.status, at: v.updatedAt
    }))
  }));
}
