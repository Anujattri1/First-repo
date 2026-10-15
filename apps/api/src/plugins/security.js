// ---------------------------------------------------------------------------
// Security & performance plugins: helmet headers, CORS, gzip/brotli
// compression, and tiered rate limiting (strict on /api/auth, generous on
// everything else). Cloudflare also caches public responses at the edge —
// see infra/README.md.
// ---------------------------------------------------------------------------
import fastifyHelmet from "@fastify/helmet";
import fastifyCors from "@fastify/cors";
import fastifyCompress from "@fastify/compress";
import fastifyRateLimit from "@fastify/rate-limit";
import config from "../config.js";

export async function registerSecurity(app) {
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false, // CSP handled via <meta> tags in the frontend
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
  });

  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      // Allow same-origin/server requests (no Origin header) and configured origins.
      if (!origin || origin === true) return cb(null, true);
      if (config.corsOrigins.includes(origin)) return cb(null, true);
      if (config.isProd && /^https:\/\/([a-z0-9-]+\.)?workers\.dev$/.test(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    maxAge: 86400
  });

  await app.register(fastifyCompress, { encodings: ["br", "gzip"] });

  await app.register(fastifyRateLimit, {
    global: true,
    max: config.rateLimitGlobalMax,
    timeWindow: config.rateLimitGlobalWindowMs,
    // Behind Cloudflare the real client IP arrives in this header:
    ipHeader: "cf-connecting-ip",
    noCache: true
  });

  // Extra-strict limiter just for credential endpoints (brute-force shield).
  // NOTE: the route-level `config.rateLimit` option overrides this hook when
  // present — keep the logic in one place (here) to avoid double counting.
  app.addHook("onRequest", async (req, reply) => {
    if (req.url.startsWith("/api/auth")) {
      try {
        await req.rateLimit({ max: config.rateLimitAuthMax, timeWindow: config.rateLimitAuthWindowMs });
      } catch {
        return reply.code(429).send({ error: "Too Many Requests", message: "Too many attempts. Try again later." });
      }
    }
  });
}

export default registerSecurity;
