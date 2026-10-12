// ---------------------------------------------------------------------------
// /api/public — fast, cacheable read endpoints used by the website.
// Responses carry Cache-Control so Cloudflare's edge can serve them without
// hitting the origin at all under heavy traffic.
// ---------------------------------------------------------------------------
import repo from "../db/repository.js";
import { cached, invalidate } from "../services/cache.js";

const TTL_MS = 30_000; // origin-side micro-cache

function publicHeaders(reply) {
  reply.header("cache-control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  reply.header("etag", '"v2"');
}

export default async function publicRoutes(app) {
  app.get("/videos", async (req, reply) => {
    publicHeaders(reply);
    const category = req.query.category ? String(req.query.category) : undefined;
    return cached(`videos:${category ?? "*"}`, TTL_MS, () =>
      repo.videos.list({ publishedOnly: true, category }));
  });

  app.get("/content", async (req, reply) => {
    publicHeaders(reply);
    return cached("content", TTL_MS, () => repo.content.all());
  });

  app.get("/settings", async (req, reply) => {
    publicHeaders(reply);
    // Only expose whitelisted, non-sensitive settings to the public frontend.
    const all = cached("settings", TTL_MS, () => repo.settings.all());
    return { siteName: all.siteName, accent: all.accent, seoDescription: all.seoDescription };
  });

  app.get("/stats", async (req, reply) => {
    publicHeaders(reply);
    return cached("stats", TTL_MS, () => ({
      videos: repo.videos.count({ status: "published" }),
      users: repo.users.count()
    }));
  });

  // Called by admin mutations via internal tools if needed.
  app.addHook("onClose", async () => invalidate("never"));
}
