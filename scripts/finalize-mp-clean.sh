#!/usr/bin/env bash
set -euo pipefail
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -w 1800 9
sleep 2
node /opt/knowledge-base/mp2rss-current/scripts/refine-mp-clean-ui.cjs /opt/ocean-intelligence/current
node --check /opt/ocean-intelligence/current/intelligence/public/app.js
pm2 restart ocean-intelligence >/dev/null
sleep 2
node --env-file=/opt/knowledge-base/.env /opt/knowledge-base/mp2rss-current/scripts/verify-mp-clean.mjs
node --env-file=/opt/knowledge-base/.env /opt/knowledge-base/mp2rss-current/scripts/audit-mp-clean-storage.mjs
systemctl is-active mp2rss-sync.timer
