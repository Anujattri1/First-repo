// ---------------------------------------------------------------------------
// App factory — builds the Fastify instance WITHOUT starting it.
// Shared by server.js (Node) and worker.js (Cloudflare Workers/MiniRaf).
// ---------------------------------------------------------------------------
import Fastify from "fastify";
import routes from "./routes/index.js";
import { handleRequest } from "./workers/handler.js";
import { getDb } from "./db/index.js";
import { registerSecurity } from "./plugins/security.js";
import { registerAuth } from "./plugins/auth.js";
import config from "./config.js";

export async function buildApp(overrides = {}) {
  const cfg = { ...config, ...overrides };
  const app = Fastify({
    logger: { level: cfg.logLevel },
    trustProxy: true, // Cloudflare / reverse-proxy friendly
    disableRequestLogging: cfg.isProd
  });

  await registerSecurity(app);
  await registerAuth(app);

  // Preferred stack: the SHARED Cloudflare-compatible handler (same code that
  // runs on Workers). Set USE_LEGACY_ROUTES=true to fall back to the original
  // per-framework route modules.
  if (!cfg.useLegacyRoutes) {
    const dbAdapter = { isNodeSqlite: true, inner: getDb() };
    const env = { DB: dbAdapter, JWT_SECRET: cfg.jwtSecret, CACHE_KV: null };
    await app.all("/api/*", async (req, reply) => {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.append(k, String(v));
      const request = new Request(url, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}) });
      const res = await handleRequest(request, env);
      reply.code(res.status);
      res.headers.forEach((v, k) => { if (!["content-length", "transfer-encoding"].includes(k)) reply.header(k, v); });
      const body = await res.text();
      return reply.send(body.length ? body : null);
    });
  } else {
    await routes(app);
  }

  // Optional: serve the static frontend from the same origin (single deploy).
  if (cfg.serveWeb) {
    const fastifyStatic = (await import("@fastify/static")).default;
    await app.register(fastifyStatic, {
      root: cfg.webRoot,
      prefix: "/",
      immutable: true,
      maxAge: "1h",
      wildcard: false
    });
    // SPA-ish fallback: unknown non-API GET requests render index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "Not Found", message: `Route ${req.method} ${req.url} not found.` });
    });
  } else {
    app.setNotFoundHandler((req, reply) =>
      reply.code(404).send({ error: "Not Found", message: `Route ${req.method} ${req.url} not found.` }));
  }

  app.addHook("onReady", () => app.log.info(`Titanium Army API ready (env=${cfg.env})`));
  return app;
}

export default buildApp;
