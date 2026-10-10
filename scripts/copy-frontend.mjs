// Build step: assembles the deployable static bundle in dist/.
// The Node server can serve apps/web directly; use dist/ for Cloudflare Pages.
import { cpSync, rmSync, mkdirSync } from "node:fs";
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("apps/web", "dist", { recursive: true });
console.log("Frontend bundled → dist/");
