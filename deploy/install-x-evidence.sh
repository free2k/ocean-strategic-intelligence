#!/bin/bash
set -euo pipefail
root=/opt/knowledge-base
intel=/opt/ocean-intelligence/current
stamp=$(date +%Y%m%dT%H%M%S)
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -n 9 || { echo 'Intelligence maintenance busy'; exit 1; }
if systemctl is-active --quiet mp2rss-sync.service; then echo 'Collection worker busy'; exit 1; fi
node -e 'if(require("/opt/ocean-intelligence/data/collection-status.json").running)process.exit(1)'
mkdir -p "$root/x-evidence-stage" "$root/x-evidence-backups/$stamp"
tar -xzf "$root/x-evidence-code.tar.gz" -C "$root/x-evidence-stage"
cd "$root/x-evidence-stage"
for file in server/integrations/x-evidence.mjs server/integrations/x-evidence-store.mjs intelligence/import-x-evidence.mjs intelligence/import-mp2rss.mjs intelligence/server.mjs intelligence/core.mjs; do node --check "$file"; done
tar -czf "$root/x-evidence-backups/$stamp/intelligence.tar.gz" -C "$intel" intelligence/import-mp2rss.mjs intelligence/server.mjs intelligence/core.mjs intelligence/auto-extract.mjs intelligence/public/app.js
cp "$root/mp2rss-current/scripts/mp2rss-worker.mjs" "$root/x-evidence-backups/$stamp/mp2rss-worker.mjs"
cp "$root/mp2rss.env" "$root/x-evidence-backups/$stamp/mp2rss.env"
chmod -R go-rwx "$root/x-evidence-backups/$stamp"
systemctl stop mp2rss-sync.timer
trap 'systemctl start mp2rss-sync.timer; pm2 restart ocean-intelligence >/dev/null' EXIT
pm2 stop ocean-intelligence >/dev/null
for file in intelligence/import-mp2rss.mjs intelligence/import-x-evidence.mjs intelligence/x-evidence-context.mjs intelligence/server.mjs intelligence/core.mjs intelligence/auto-extract.mjs intelligence/public/app.js intelligence/public/x-evidence-view.js; do cp "$file" "$intel/$file"; done
for file in server/integrations/x-evidence.mjs server/integrations/x-evidence-store.mjs scripts/mp2rss-worker.mjs scripts/x-evidence-ops.mjs; do cp "$file" "$root/mp2rss-current/$file"; done
tar -xzf "$root/x-evidence-code.tar.gz" -C "$root"
sed -i '/^MP2_VISION_MODEL=/d;/^MP2_EVIDENCE_DIR=/d;/^INTEL_ENABLE_AI=/d' "$root/mp2rss.env"
printf '\nMP2_VISION_MODEL=qwen3-vl-plus\nMP2_EVIDENCE_DIR=/opt/knowledge-base/.data/mp2rss-evidence\nINTEL_ENABLE_AI=true\n' >> "$root/mp2rss.env"
chmod 600 "$root/mp2rss.env"
cd "$root/mp2rss-current"
node --env-file="$root/.env" --env-file="$root/mp2rss.env" scripts/x-evidence-ops.mjs --enable-samples
echo "Installed X evidence pipeline. Backup: $root/x-evidence-backups/$stamp"
