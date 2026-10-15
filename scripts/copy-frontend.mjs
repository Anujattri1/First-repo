// Build step: assembles the deployable static bundle in dist/.
// The Node server can serve apps/web directly; use dist/ for Cloudflare Pages.
import { cpSync, rmSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("apps/web", "dist", { recursive: true });

// Cloudflare Pages config — generated so the dashboard needs zero setup.
// Root dir "public" contains _headers (edge security + cache headers).
writeFileSync(
  "public/_redirects",
  "/api/*  https://first-project.attrim27-16d.workers.dev/api/:splat  200\n"
);
if (!existsSync("dist/_headers")) {
  cpSync("public/_headers", "dist/_headers"); // also used by Workers Assets
}
console.log("Frontend bundled → dist/  (+ public/_redirects for Pages)");
