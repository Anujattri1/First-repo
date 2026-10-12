// ---------------------------------------------------------------------------
// Titanium Army — Cloudflare Worker entry point.
// Serves the STATIC FRONTEND (bundled from apps/web via `no-bundled` build)
// and the JSON API (shared handler in ../apps/api/src/workers/handler.js).
// Deploy:  npm run deploy:worker   (wrangler.toml at repo root)
// ---------------------------------------------------------------------------
import { handleRequest } from "../apps/api/src/workers/handler.js";

function withSecurityHeaders(res, extra = {}) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  if (!h.get("x-content-type-options")) h.set("x-content-type-options", "nosniff");
  if (!h.get("referrer-policy")) h.set("referrer-policy", "strict-origin-when-cross-origin");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

async function serveAsset(request, env) {
  // Modern Cloudflare "Assets" binding (wrangler assets config below).
  if (!env.ASSETS) return null;
  try {
    const url = new URL(request.url);
    let key = decodeURIComponent(url.pathname);
    if (key.endsWith("/")) key += "index.html";
    const res = await env.ASSETS.fetch(new Request(new URL(key, url.origin), request));
    if (res.status === 404) return null;
    return res;
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1) API requests -> shared handler (same code as the Node server)
    if (url.pathname.startsWith("/api/")) {
      try {
        const res = await handleRequest(request, env);
        return withSecurityHeaders(res, { "cache-control": res.headers.get("cache-control") || "no-store" });
      } catch (e) {
        console.error("worker api error:", e);
        return new Response(JSON.stringify({ error: "Internal Server Error", message: String(e?.message || e) }), {
          status: 500, headers: { "content-type": "application/json" }
        });
      }
    }

    // 2) Static frontend (Pages-style assets bundled into the Worker)
    const asset = await serveAsset(request, env);
    if (asset) {
      const cacheable = /\.(css|js|svg|png|jpg|webp|woff2?)$/.test(url.pathname);
      return withSecurityHeaders(asset, {
        "cache-control": cacheable ? "public, max-age=86400" : "public, max-age=300, s-maxage=3600"
      });
    }

    // 3) SPA-ish fallbacks: /admin -> admin dashboard, else homepage
    const fallbackPath = url.pathname.startsWith("/admin") ? "/admin/index.html" : "/index.html";
    const fallback = await serveAsset(new Request(new URL(fallbackPath, url.origin), request), env);
    if (fallback) return fallback;

    return new Response("Not found", { status: 404 });
  },

  // Cron trigger (optional): keep public caches warm under heavy traffic.
  async scheduled(event, env, ctx) {
    try {
      await handleRequest(new Request("https://internal/api/public/videos"), env);
      await handleRequest(new Request("https://internal/api/public/content"), env);
    } catch (e) { console.error("warmup failed:", e); }
  }
};
