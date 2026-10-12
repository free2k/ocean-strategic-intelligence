#!/usr/bin/env bash
set -euo pipefail
base=/opt/knowledge-base
stage=$base/subscription-batch-stage
test -f "$stage/.output/server/index.mjs"
backup=$base/discovery-ui-backup-$(date +%Y%m%dT%H%M%S)
mkdir -p "$backup"
cp -a "$stage/.output" "$backup/new-output"
pm2 stop knowledge-base >/dev/null
trap 'pm2 start knowledge-base >/dev/null' EXIT
mv "$base/.output" "$backup/output"
mv "$backup/new-output" "$base/.output"
cp "$stage/components/MpDiscoveryPanel.vue" "$base/components/MpDiscoveryPanel.vue"
cp "$stage/server/api/subscriptions/discovery.get.ts" "$base/server/api/subscriptions/discovery.get.ts"
echo 'Progress UI deployed; worker unchanged'
