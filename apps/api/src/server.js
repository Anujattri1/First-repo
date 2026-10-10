// ---------------------------------------------------------------------------
// Node entry point — run locally or on any VPS/container host.
//   npm start          (production)
//   npm run dev        (auto-reload)
// ---------------------------------------------------------------------------
import { buildApp } from "./app.js";
import config from "./config.js";

const app = await buildApp();

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Graceful shutdown
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    app.log.info(`${sig} received — shutting down`);
    await app.close();
    process.exit(0);
  });
}
