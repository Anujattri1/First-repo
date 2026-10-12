// Entry point for wrangler (main = "worker/index.js" in wrangler.toml).
// All logic lives in router.js / shared handler so the Node server can
// import the same pieces without pulling in Workers-only glue.
export { default, fetch, scheduled } from "./router.js";
