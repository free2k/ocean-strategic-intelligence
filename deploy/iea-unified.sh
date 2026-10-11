#!/bin/bash
set -euo pipefail
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -n 9 || { echo 'Collection running; deployment not started'; exit 75; }
live=/opt/ocean-intelligence/current
stage=/opt/ocean-intelligence/iea-unified-stage
backup=/opt/ocean-intelligence/iea-backups/unified-$(date +%Y%m%dT%H%M%S)
mkdir -p "$backup" "$stage/next/intelligence/quant-preview" "$stage/next/intelligence/public"
files='intelligence/quant-routes.mjs intelligence/quant-preview/app.js intelligence/quant-preview/charts.js intelligence/server.mjs intelligence/public/app.js'
for f in $files; do mkdir -p "$backup/$(dirname "$f")"; cp "$live/$f" "$backup/$f"; cp "$live/$f" "$stage/next/$f"; done
node "$stage/scripts/integrate-iea-unified.cjs" "$stage/next"
node "$stage/scripts/integrate-iea-cohorts.cjs" "$stage/next"
for f in $files; do node --check "$stage/next/$f"; done
rollback(){ for f in $files; do cp "$backup/$f" "$live/$f"; done; pm2 restart ocean-intelligence >/dev/null; echo 'Deployment rolled back'; }
trap rollback ERR
cp "$stage/intelligence/iea-quant.mjs" "$live/intelligence/iea-quant.mjs"
cp "$stage/intelligence/quant-preview/official-charts.js" "$live/intelligence/quant-preview/official-charts.js"
for f in $files; do cp "$stage/next/$f" "$live/$f"; done
pm2 restart ocean-intelligence >/dev/null
for attempt in 1 2 3 4 5; do if curl -fsS http://127.0.0.1:3101/api/health >/dev/null; then echo "Deployed successfully; backup $backup"; trap - ERR; exit 0; fi; sleep 2; done
exit 1
