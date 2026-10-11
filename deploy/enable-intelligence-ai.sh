#!/bin/bash
set -euo pipefail
umask 077
export PATH=/usr/local/bin:/usr/bin:/bin
export PM2_HOME=/root/.pm2
# Cooperate with independently installed EIA data/news publishers.
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -w 600 9
cd /opt/ocean-intelligence/current
tar -czf /opt/ocean-intelligence/before-ai-upgrade-code.tar.gz intelligence
stopped=0
resume(){ if [ "$stopped" = 1 ]; then tar -xzf /opt/ocean-intelligence/before-ai-upgrade-code.tar.gz; pm2 restart ocean-intelligence >/dev/null; fi; }
trap resume EXIT
pm2 stop ocean-intelligence >/dev/null
stopped=1
tar -xzf /opt/ocean-intelligence/ai-upgrade-code.tar.gz
node --check intelligence/server.mjs
export INTEL_DATA_DIR=/opt/ocean-intelligence/data
export INTEL_UPGRADE_STAGE=/opt/ocean-intelligence/ai-upgrade-stage
node --env-file=/opt/knowledge-base/.env intelligence/publish-upgrade.mjs
export INTEL_ENABLE_AI=true
export INTEL_SCHEDULE=true
export INTEL_EIA_EXTERNAL=true
pm2 restart ocean-intelligence --update-env >/dev/null
pm2 save >/dev/null
for attempt in {1..15}; do
 if curl --fail --silent --max-time 3 http://127.0.0.1:3101/api/health; then stopped=0; echo; exit 0; fi
 sleep 1
done
exit 1
