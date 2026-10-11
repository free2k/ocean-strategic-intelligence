#!/bin/bash
set -euo pipefail
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -n 9 || { echo 'Maintenance busy; no changes made'; exit 1; }
root=/opt/ocean-intelligence/current
stage=/opt/ocean-intelligence/iea-stage
backup=/opt/ocean-intelligence/iea-backups/final-$(date +%Y%m%dT%H%M%S)
for file in intelligence/iea-datasets.mjs intelligence/quant-preview/iea-view.js intelligence/quant-routes.mjs; do mkdir -p "$backup/$(dirname "$file")"; cp "$root/$file" "$backup/$file"; done
node --check "$stage/intelligence/iea-datasets.mjs"
node --check "$stage/intelligence/quant-preview/iea-view.js"
cp "$stage/intelligence/iea-datasets.mjs" "$root/intelligence/iea-datasets.mjs"
cp "$stage/intelligence/quant-preview/iea-view.js" "$root/intelligence/quant-preview/iea-view.js"
node "$stage/scripts/integrate-iea.cjs" "$root"
node --check "$root/intelligence/quant-routes.mjs"
pm2 restart ocean-intelligence >/dev/null
echo "IEA final checks deployed; backup: $backup"
