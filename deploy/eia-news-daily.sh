#!/bin/bash
set -euo pipefail
umask 077
export PATH=/usr/local/bin:/usr/bin:/bin
export PM2_HOME=/root/.pm2
# Same lock as the EIA statistical job.
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -w 600 9
cd /opt/ocean-intelligence/current
export EIA_NEWS_STAGE_DIR=/opt/ocean-intelligence/eia-news-stage
export INTEL_DATA_DIR=/opt/ocean-intelligence/data
export EIA_NEWS_AI=true
node --env-file=/opt/knowledge-base/.env intelligence/collect-eia-news.mjs
stopped=0
resume(){ if [ "$stopped" = 1 ]; then pm2 restart ocean-intelligence; fi; }
trap resume EXIT
pm2 stop ocean-intelligence
stopped=1
node --env-file=/opt/knowledge-base/.env intelligence/publish-eia-news.mjs
pm2 restart ocean-intelligence
stopped=0
for attempt in {1..15}; do
 if curl --fail --silent --max-time 3 http://127.0.0.1:3101/api/health; then echo ' EIA news update completed'; exit 0; fi
 sleep 1
done
exit 1
