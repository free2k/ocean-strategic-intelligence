#!/bin/bash
set -euo pipefail
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -n 9 || { echo 'Maintenance busy'; exit 1; }
cd /opt/ocean-intelligence/current
node -e 'if(require("/opt/ocean-intelligence/data/collection-status.json").running)process.exit(1)'
node --check intelligence/enrich.limit-next.mjs
node --check intelligence/scheduler.limit-next.mjs
cp intelligence/enrich.mjs intelligence/enrich.before-unlimited.mjs
cp intelligence/scheduler.mjs intelligence/scheduler.before-unlimited.mjs
pm2 stop ocean-intelligence >/dev/null
trap 'pm2 restart ocean-intelligence >/dev/null' EXIT
cp intelligence/enrich.limit-next.mjs intelligence/enrich.mjs
cp intelligence/scheduler.limit-next.mjs intelligence/scheduler.mjs
echo 'Unlimited enrichment deployed; concurrency 2; worker timeout 2 hours'
