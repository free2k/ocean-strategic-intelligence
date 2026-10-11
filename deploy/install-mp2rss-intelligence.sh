#!/bin/bash
set -euo pipefail
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -n 9 || { echo 'Maintenance busy'; exit 1; }
cd /opt/ocean-intelligence/current
node -e 'if(require("/opt/ocean-intelligence/data/collection-status.json").running)process.exit(1)'
node --check intelligence/scheduler.mp2-next.mjs
cp intelligence/scheduler.mjs intelligence/scheduler.before-mp2.mjs
cp intelligence/public/index.html intelligence/public/index.before-mp2.html
cp intelligence/public/app.js intelligence/public/app.before-mp2.js
pm2 stop ocean-intelligence >/dev/null
trap 'pm2 restart ocean-intelligence >/dev/null' EXIT
node --env-file=/opt/knowledge-base/.env intelligence/publish-mp2rss.mjs
cp intelligence/scheduler.mp2-next.mjs intelligence/scheduler.mjs
cp public-index.mp2-next.html intelligence/public/index.html
cp public-app.mp2-next.js intelligence/public/app.js
echo 'Mp2RSS intelligence bridge installed'
