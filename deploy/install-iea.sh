#!/bin/bash
set -euo pipefail
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -n 9 || { echo 'Collection running; deployment deferred without changes'; exit 1; }
root=/opt/ocean-intelligence/current
stage=/opt/ocean-intelligence/iea-stage
backup=/opt/ocean-intelligence/iea-backups/$(date +%Y%m%dT%H%M%S)
mkdir -p "$backup"
files='intelligence/scheduler.mjs intelligence/quant-routes.mjs intelligence/quant-preview/app.js intelligence/expanded-sources.mjs'
for file in $files; do mkdir -p "$backup/$(dirname "$file")"; cp "$root/$file" "$backup/$file"; done
for file in intelligence/iea-datasets.mjs intelligence/iea-import.mjs intelligence/publish-iea.mjs intelligence/quant-preview/iea-view.js; do node --check "$stage/$file"; cp "$stage/$file" "$root/$file"; done
node "$stage/scripts/integrate-iea.cjs" "$root"
for file in $files; do node --check "$root/$file"; done
cd "$root"
export INTEL_DATA_DIR=/opt/ocean-intelligence/data
export IEA_STAGE_DIR="$stage/data"
export IEA_DATA_HOME=/opt/ocean-intelligence/data/iea
export DOWNLOAD_PROXY=http://127.0.0.1:10808
node --env-file=/opt/knowledge-base/.env intelligence/publish-iea.mjs --prepare
INTEL_DATA_DIR="$IEA_STAGE_DIR" node --env-file=/opt/knowledge-base/.env intelligence/iea-datasets.mjs --force
INTEL_DATA_DIR="$IEA_STAGE_DIR" node --env-file=/opt/knowledge-base/.env --input-type=module - <<'NODE'
import {collectExpanded} from './intelligence/expanded-sources.mjs';
await collectExpanded(process.env.INTEL_DATA_DIR,{sourceIds:['iaea-news','iaea-publications']});
NODE
pm2 stop ocean-intelligence >/dev/null
trap 'pm2 restart ocean-intelligence >/dev/null' EXIT
node --env-file=/opt/knowledge-base/.env intelligence/publish-iea.mjs
echo "IEA integration deployed; backup: $backup"
