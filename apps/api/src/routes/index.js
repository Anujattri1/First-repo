// ---------------------------------------------------------------------------
// Route registration hub — add a new module here to expose it under /api.
// ---------------------------------------------------------------------------
import authRoutes from "./auth.routes.js";
import publicRoutes from "./public.routes.js";
import adminRoutes from "./admin.routes.js";
import cacheRoutes from "./cache.routes.js";

export default async function routes(app) {
  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(publicRoutes, { prefix: "/api/public" });
  app.register(adminRoutes, { prefix: "/api/admin" });
  app.register(cacheRoutes, { prefix: "/api/cache" });

  // Health check for uptime monitors / Cloudflare Workers cron.
  app.get("/api/health", async () => ({ status: "ok", time: new Date().toISOString() }));
}
