// ---------------------------------------------------------------------------
// /api/auth — real server-side authentication (bcrypt + JWT).
// Replaces the old localStorage demo login entirely.
// ---------------------------------------------------------------------------
import bcrypt from "bcryptjs";
import repo from "../db/repository.js";
import config from "../config.js";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function authRoutes(app) {
  app.post("/login", async (req, reply) => {
      const { email, password } = req.body ?? {};
      if (!email || !password || !emailRe.test(String(email))) {
        return reply.code(400).send({ error: "Bad Request", message: "Email and password are required." });
      }
      const user = repo.users.byEmail(String(email).trim());
      // Constant-time-ish: always run a compare even for unknown users.
      const hash = user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
      const ok = await bcrypt.compare(String(password), hash);
      if (!user || !ok || !user.active) {
        return reply.code(401).send({ error: "Unauthorized", message: "Invalid credentials." });
      }
      const token = app.jwt.sign({ id: user.id, role: user.role, name: user.name });
      return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    });

  app.get("/me", { preHandler: [app.authenticate] }, async (req) => ({ user: req.profile }));

  app.post("/change-password", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword || String(newPassword).length < 8) {
      return reply.code(400).send({ error: "Bad Request", message: "New password must be at least 8 characters." });
    }
    const user = repo.users.byEmail(req.profile.email);
    if (!user || !(await bcrypt.compare(String(currentPassword), user.passwordHash))) {
      return reply.code(401).send({ error: "Unauthorized", message: "Current password is incorrect." });
    }
    repo.users.update(user.id, { passwordHash: await bcrypt.hash(String(newPassword), config.bcryptRounds) });
    return { message: "Password updated." };
  });
}
