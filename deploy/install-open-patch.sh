#!/bin/bash
set -euo pipefail
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -n 9 || { echo 'Collection is still running; no changes made'; exit 1; }
root=/opt/ocean-intelligence/current
stage=/opt/ocean-intelligence/open-patch-stage
backup=/opt/ocean-intelligence/open-data-backups/patch-$(date +%Y%m%dT%H%M%S)
mkdir -p "$backup"
files='intelligence/scheduler.mjs intelligence/quant-routes.mjs intelligence/quant-preview/charts.js intelligence/public/interactions.js'
for file in $files; do node --check "$stage/$file"; mkdir -p "$backup/$(dirname "$file")"; cp "$root/$file" "$backup/$file"; done
pm2 stop ocean-intelligence >/dev/null
trap 'pm2 restart ocean-intelligence >/dev/null' EXIT
for file in $files; do cp "$stage/$file" "$root/$file"; done
echo "Source schedule and chart filter patch installed; backup: $backup"
