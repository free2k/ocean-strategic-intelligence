#!/usr/bin/env bash
set -euo pipefail
base=/opt/knowledge-base
stage=$base/subscription-batch-stage
test -f "$stage/.output/server/index.mjs"
systemctl stop mp2rss-sync.timer
trap 'systemctl start mp2rss-sync.timer' EXIT
if systemctl is-active --quiet mp2rss-sync.service; then echo 'Worker busy; retry after it finishes'; exit 2; fi
backup=$base/subscription-batch-backup-$(date +%Y%m%dT%H%M%S)
mkdir -p "$backup"
cp "$base/mp2rss-current/server/integrations/mp2rss-store.mjs" "$backup/worker-store.mjs"
cp "$base/pages/wechat/subscriptions.vue" "$backup/subscriptions.vue"
cp -a "$stage/.output" "$backup/new-output"
pm2 stop knowledge-base >/dev/null
trap 'pm2 start knowledge-base >/dev/null; systemctl start mp2rss-sync.timer' EXIT
mv "$base/.output" "$backup/output"
mv "$backup/new-output" "$base/.output"
for f in mp2rss-store.mjs mp2rss-batch.mjs mp-content-clean.mjs; do
 cp "$stage/server/integrations/$f" "$base/server/integrations/$f"
 cp "$stage/server/integrations/$f" "$base/mp2rss-current/server/integrations/$f"
done
cp "$stage/pages/wechat/subscriptions.vue" "$base/pages/wechat/subscriptions.vue"
cp "$stage/components/MpSubscriptionBatch.vue" "$base/components/MpSubscriptionBatch.vue"
cp "$stage/server/api/subscriptions/batch.post.ts" "$base/server/api/subscriptions/batch.post.ts"
echo 'Batch subscription UI and worker deployed'
