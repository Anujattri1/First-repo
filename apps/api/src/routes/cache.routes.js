// ---------------------------------------------------------------------------
// /api/cache — Cloudflare edge-cache purge so admin edits go live instantly
// instead of waiting for the public endpoint TTL to expire.
// Requires CF_ZONE_ID + CF_API_TOKEN env vars (see docs/DEPLOYMENT.md).
// ---------------------------------------------------------------------------
export default async function cacheRoutes(app) {
  app.post("/purge", { preHandler: [app.authenticate, app.authorize("admin", "editor")] }, async (req, reply) => {
    // Invalidate the origin-side micro-cache immediately regardless of CF.
    const { clearCache } = await import("../services/cache.js");
    clearCache();

    const zoneId = process.env.CF_ZONE_ID;
    const apiToken = process.env.CF_API_TOKEN;
    if (!zoneId || !apiToken) {
      return reply.code(202).send({ purged: false, message: "Origin cache cleared. Set CF_ZONE_ID / CF_API_TOKEN to also purge the Cloudflare edge cache." });
    }
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
        body: JSON.stringify({ purge_everything: true })
      });
      const data = await res.json();
      return { purged: !!data.success };
    } catch (err) {
      return reply.code(502).send({ purged: false, message: String(err.message) });
    }
  });
}
