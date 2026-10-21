#!/bin/bash
set -euo pipefail
umask 077
export PATH=/usr/local/bin:/usr/bin:/bin
export PM2_HOME=/root/.pm2
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -w 600 9
cd /opt/ocean-intelligence/current
export EIA_NEWS_STAGE_DIR=/opt/ocean-intelligence/eia-news-stage
export INTEL_DATA_DIR=/opt/ocean-intelligence/data
export EIA_NEWS_AI=true INTEL_ENABLE_AI=true
node --env-file=/opt/knowledge-base/.env intelligence/collect-eia-news.mjs
# All expensive model work is staged while the website remains available.
node --env-file=/opt/knowledge-base/.env intelligence/process-eia-news.mjs
node --env-file=/opt/knowledge-base/.env intelligence/publish-eia-news.mjs
