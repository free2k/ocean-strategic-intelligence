#!/bin/bash
set -euo pipefail
umask 077
export PATH=/usr/local/bin:/usr/bin:/bin
export PM2_HOME=/root/.pm2
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -n 9 || exit 0
cd /opt/ocean-intelligence/current
export EIA_STAGE_DIR=/opt/ocean-intelligence/eia-stage
mkdir -p "$EIA_STAGE_DIR"
if [ ! -f "$EIA_STAGE_DIR/snapshot.json" ]; then
  printf '%s' '{"sources":[],"series":[]}' > "$EIA_STAGE_DIR/snapshot.json"
fi
# Network failure exits before touching the live application or database.
INTEL_DATA_DIR="$EIA_STAGE_DIR" node --env-file=/opt/ocean-intelligence/eia.env intelligence/import-eia.mjs
INTEL_DATA_DIR=/opt/ocean-intelligence/data node --env-file=/opt/knowledge-base/.env intelligence/publish-eia.mjs
for attempt in {1..15}; do
  if curl --fail --silent --max-time 3 http://127.0.0.1:3101/api/health; then
    echo ' EIA daily update completed'
    exit 0
  fi
  sleep 1
done
echo 'Intelligence health check failed' >&2
exit 1
