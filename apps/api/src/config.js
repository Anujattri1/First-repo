// ---------------------------------------------------------------------------
// Titanium Army API — configuration (single source of truth for env vars)
// Edit values here or override them with environment variables / .env file.
// ---------------------------------------------------------------------------
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..", ".."); // repo root

const env = (key, fallback) => process.env[key] ?? fallback;
const int = (key, fallback) => Number.parseInt(env(key, fallback), 10);
const bool = (key, fallback) => String(env(key, fallback)) === "true";

export const config = {
  env: env("NODE_ENV", "development"),
  isProd: env("NODE_ENV", "development") === "production",

  host: env("HOST", "0.0.0.0"),
  port: int("PORT", 8787),

  // Security — CHANGE THESE IN PRODUCTION (see docs/DEPLOYMENT.md)
  jwtSecret: env("JWT_SECRET", "change-me-in-production-dev-secret"),
  jwtExpiresIn: env("JWT_EXPIRES_IN", "12h"),
  bcryptRounds: int("BCRYPT_ROUNDS", 10),

  // Database (SQLite by default — swap-friendly repository layer)
  dbFile: env("DB_FILE", path.join(root, "data", "titanium.db")),

  // Rate limiting (public reads are generous, auth writes are strict)
  rateLimitGlobalMax: int("RATE_LIMIT_GLOBAL_MAX", 1000),      // per window / IP
  rateLimitGlobalWindowMs: int("RATE_LIMIT_GLOBAL_WINDOW_MS", 60_000),
  rateLimitAuthMax: int("RATE_LIMIT_AUTH_MAX", 10),            // login attempts
  rateLimitAuthWindowMs: int("RATE_LIMIT_AUTH_WINDOW_MS", 60_000),

  // Static frontend served by the same process (zero-config single origin)
  webRoot: env("WEB_ROOT", path.join(root, "apps", "web")),
  serveWeb: bool("SERVE_WEB", "true"),

  // CORS — comma-separated list of extra allowed origins
  corsOrigins: env("CORS_ORIGINS", "http://localhost:8787").split(",").map(s => s.trim()),

  // Default admin account created on first seed (force password change in prod)
  adminEmail: env("ADMIN_EMAIL", "admin@titaniumarmy.test"),
  adminPassword: env("ADMIN_PASSWORD", "Admin@123"),
  adminName: env("ADMIN_NAME", "Administrator"),

  logLevel: env("LOG_LEVEL", "info")
};

export default config;
