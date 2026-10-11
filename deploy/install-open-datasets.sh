#!/bin/bash
set -euo pipefail
root=/opt/ocean-intelligence/current
stage=/opt/ocean-intelligence/open-data-stage
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -n 9 || { echo 'Existing collection is running; installation deferred'; exit 1; }
cd "$stage"
for file in intelligence/*.mjs intelligence/quant-preview/*.mjs intelligence/quant-preview/*.js; do node --check "$file"; done
backup=/opt/ocean-intelligence/open-data-backups/$(date +%Y%m%dT%H%M%S)
mkdir -p "$backup"
find intelligence -type f > "$backup/files.txt"
while IFS= read -r file; do if [ -f "$root/$file" ]; then mkdir -p "$backup/$(dirname "$file")"; cp "$root/$file" "$backup/$file"; fi; done < "$backup/files.txt"
chmod -R go-rwx "$backup"
pm2 stop ocean-intelligence >/dev/null
trap 'pm2 restart ocean-intelligence >/dev/null' EXIT
while IFS= read -r file; do mkdir -p "$root/$(dirname "$file")"; cp "$file" "$root/$file"; done < "$backup/files.txt"
cd "$root"
INTEL_DATA_DIR=/opt/ocean-intelligence/data OPEN_DATA_STAGE="$stage/data" node --env-file=/opt/knowledge-base/.env intelligence/publish-open-datasets.mjs
echo "Open datasets deployed; backup: $backup"
