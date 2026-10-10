// ---------------------------------------------------------------------------
// Auth plugin — registers fastify-jwt + `authenticate` / `authorize(roles)`
// decorators. Routes opt in with preHandler hooks; nothing global.
// ---------------------------------------------------------------------------
import fastifyJwt from "@fastify/jwt";
import config from "../config.js";

export async function registerAuth(app) {
  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.jwtExpiresIn }
  });

  app.decorate("authenticate", async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "Unauthorized", message: "Valid session token required." });
    }
    if (req.user?.id) {
      const { users } = await import("../db/repository.js");
      const u = users.byId(req.user.id);
      if (!u || !u.active) {
        return reply.code(401).send({ error: "Unauthorized", message: "Account is disabled or removed." });
      }
      req.profile = u;
    }
  });

  app.decorate("authorize", (...roles) => async (req, reply) => {
    if (!roles.includes(req.profile?.role)) {
      return reply.code(403).send({ error: "Forbidden", message: "Insufficient permissions for this action." });
    }
  });
}

export default registerAuth;
