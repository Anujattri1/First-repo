#!/usr/bin/env bash
# Seeds the LOCAL D1 preview database (used by `wrangler dev`).
set -euo pipefail
cd "$(dirname "$0")/.."
npx wrangler d1 execute titanium-army --local --file=./worker/schema.sql
npx wrangler d1 execute titanium-army --local --file=./worker/seed.sql
echo "Local D1 seeded. Run 'npm run dev:worker' and open http://localhost:8787"
