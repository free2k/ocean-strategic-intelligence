#!/usr/bin/env bash
set -euo pipefail
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -n 9 || { echo 'Intelligence maintenance busy'; exit 2; }
systemctl stop mp2rss-sync.timer
trap 'systemctl start mp2rss-sync.timer' EXIT
if systemctl is-active --quiet mp2rss-sync.service; then echo 'Mp2RSS busy'; exit 2; fi
backup=/opt/knowledge-base/mp-clean-code-backup-$(date +%Y%m%dT%H%M%S)
mkdir -p "$backup"
cp /opt/knowledge-base/mp2rss-current/server/integrations/mp2rss-store.mjs "$backup/"
cp /opt/ocean-intelligence/current/intelligence/{server.mjs,import-mp2rss.mjs} "$backup/"
cp /opt/ocean-intelligence/current/intelligence/public/app.js "$backup/"
node /opt/knowledge-base/mp2rss-current/scripts/integrate-mp-clean.cjs /opt/knowledge-base/mp2rss-current
node /opt/knowledge-base/mp2rss-current/scripts/integrate-mp-clean.cjs /opt/ocean-intelligence/current
node --check /opt/ocean-intelligence/current/intelligence/server.mjs
node --check /opt/ocean-intelligence/current/intelligence/public/app.js
node --check /opt/knowledge-base/mp2rss-current/server/integrations/mp2rss-store.mjs
cd /opt/knowledge-base/mp2rss-current
node --env-file=/opt/knowledge-base/.env scripts/reclean-mp-items.mjs --apply
pm2 restart ocean-intelligence >/dev/null
echo 'Cleaning applied; server restarted; timer restored on exit'
