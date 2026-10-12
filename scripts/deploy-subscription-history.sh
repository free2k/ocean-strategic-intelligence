#!/usr/bin/env bash
set -euo pipefail
base=/opt/knowledge-base
stage=$base/subscription-batch-stage
backup=$base/subscription-history-backup-$(date +%Y%m%dT%H%M%S)
test -f "$stage/.output/server/index.mjs"
mkdir -p "$backup"
cp -a "$stage/.output" "$backup/new-output"
cp "$base/server/integrations/mp2rss-store.mjs" "$backup/mp2rss-store.mjs"
cp "$base/components/MpSubscriptionsHome.vue" "$backup/MpSubscriptionsHome.vue"
pm2 stop knowledge-base >/dev/null
trap 'pm2 start knowledge-base >/dev/null' EXIT
mv "$base/.output" "$backup/output"
mv "$backup/new-output" "$base/.output"
cp "$stage/components/MpSubscriptionsHome.vue" "$base/components/MpSubscriptionsHome.vue"
cp "$stage/server/integrations/subscription-history.mjs" "$base/server/integrations/subscription-history.mjs"
cp "$stage/server/integrations/mp2rss-store.mjs" "$base/server/integrations/mp2rss-store.mjs"
echo 'Subscription history deployed'
