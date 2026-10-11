#!/bin/bash
set -euo pipefail
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -n 9 || { echo 'Maintenance busy; no changes made'; exit 1; }
cd /opt/ocean-intelligence/current
node -e 'const s=require("/opt/ocean-intelligence/data/collection-status.json");if(s.running)process.exit(1)'
node --check intelligence/scheduler.expansion-next.mjs
cp intelligence/scheduler.mjs intelligence/scheduler.before-expansion.mjs
pm2 stop ocean-intelligence >/dev/null
trap 'pm2 restart ocean-intelligence >/dev/null' EXIT
INTEL_DATA_DIR=/opt/ocean-intelligence/data EXPANDED_STAGE_DIR=/opt/ocean-intelligence/expansion-stage node --env-file=/opt/knowledge-base/.env intelligence/publish-expanded.mjs
cp intelligence/scheduler.expansion-next.mjs intelligence/scheduler.mjs
echo 'Snapshot published and six-hour scheduler updated'
