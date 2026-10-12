#!/usr/bin/env bash
set -euo pipefail
base=/opt/knowledge-base
stage=$base/subscription-batch-stage
test -f "$stage/.output/server/index.mjs"
backup=$base/classification-queue-backup-$(date +%Y%m%dT%H%M%S)
mkdir -p "$backup"
cp -a "$stage/.output" "$backup/new-output"
cp "$base/mp2rss-current/server/integrations/mp2rss-store.mjs" "$backup/worker-store.mjs"
pm2 stop knowledge-base >/dev/null
trap 'pm2 start knowledge-base >/dev/null' EXIT
mv "$base/.output" "$backup/output"
mv "$backup/new-output" "$base/.output"
for f in MpSubscriptionsHome.vue MpClassificationReason.vue; do cp "$stage/components/$f" "$base/components/$f"; done
cp "$stage/pages/wechat/subscription-articles.vue" "$base/pages/wechat/subscription-articles.vue"
cp "$stage/server/api/subscriptions/items.get.ts" "$base/server/api/subscriptions/items.get.ts"
cp "$stage/server/integrations/mp2rss-store.mjs" "$base/server/integrations/mp2rss-store.mjs"
cp "$stage/server/integrations/mp2rss-store.mjs" "$base/mp2rss-current/server/integrations/mp2rss-store.next.mjs"
mv "$base/mp2rss-current/server/integrations/mp2rss-store.next.mjs" "$base/mp2rss-current/server/integrations/mp2rss-store.mjs"
echo 'Classification evidence and queue status deployed'
