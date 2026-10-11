#!/usr/bin/env bash
set -euo pipefail
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -n 9
pm2 stop ocean-intelligence >/dev/null
trap 'pm2 start ocean-intelligence >/dev/null' EXIT
cd /opt/ocean-intelligence/current
node --env-file=/opt/knowledge-base/.env scripts/publish-mp-clean.mjs
