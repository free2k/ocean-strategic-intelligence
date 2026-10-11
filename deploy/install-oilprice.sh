#!/bin/bash
set -euo pipefail
root=/opt/knowledge-base
intel=/opt/ocean-intelligence/current
stage=$root/oilprice-stage
stamp=$(date +%Y%m%dT%H%M%S)
backup=$root/oilprice-backups/$stamp
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -n 9 || { echo 'Intelligence maintenance busy'; exit 1; }
if systemctl is-active --quiet mp2rss-sync.service; then echo 'Evidence worker busy'; exit 1; fi
if systemctl is-active --quiet oilprice-sync.service; then echo 'OilPrice worker busy'; exit 1; fi
mkdir -p "$stage" "$backup"
tar -xzf "$root/oilprice-code.tar.gz" -C "$stage"
cd "$stage"
for file in server/integrations/oilprice.mjs server/integrations/x-evidence.mjs server/integrations/x-evidence-store.mjs scripts/oilprice-worker.mjs intelligence/import-x-evidence.mjs intelligence/public/x-evidence-view.js intelligence/x-evidence-context.mjs; do node --check "$file"; done
tar -czf "$backup/worker.tar.gz" -C "$root/mp2rss-current" server/integrations/x-evidence.mjs server/integrations/x-evidence-store.mjs
tar -czf "$backup/intelligence.tar.gz" -C "$intel" intelligence/import-x-evidence.mjs intelligence/public/x-evidence-view.js intelligence/x-evidence-context.mjs
chmod -R go-rwx "$backup"
systemctl stop mp2rss-sync.timer
trap 'systemctl start mp2rss-sync.timer; pm2 restart ocean-intelligence >/dev/null' EXIT
pm2 stop ocean-intelligence >/dev/null
for file in server/integrations/oilprice.mjs server/integrations/x-evidence.mjs server/integrations/x-evidence-store.mjs scripts/oilprice-worker.mjs; do cp "$file" "$root/mp2rss-current/$file"; cp "$file" "$root/$file"; done
for file in intelligence/import-x-evidence.mjs intelligence/public/x-evidence-view.js intelligence/x-evidence-context.mjs; do cp "$file" "$intel/$file"; done
cp deploy/oilprice-sync.service deploy/oilprice-sync.timer /etc/systemd/system/
cd "$root/mp2rss-current"
node --env-file="$root/.env" --env-file="$root/mp2rss.env" scripts/oilprice-worker.mjs --register
systemctl daemon-reload
systemctl enable oilprice-sync.timer
echo "Installed OilPrice collection. Backup: $backup"
