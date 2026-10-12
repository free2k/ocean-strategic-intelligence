#!/usr/bin/env bash
set -euo pipefail
base=/opt/knowledge-base
stage=$base/subscription-batch-stage
test -f "$stage/.output/server/index.mjs"
systemctl stop mp2rss-sync.timer
trap 'systemctl start mp2rss-sync.timer' EXIT
if systemctl is-active --quiet mp2rss-sync.service; then echo 'Worker busy'; exit 2; fi
backup=$base/discovery-backup-$(date +%Y%m%dT%H%M%S)
mkdir -p "$backup/worker"
cp -a "$base/mp2rss-current/server/integrations" "$backup/worker/"
cp "$base/mp2rss-current/scripts/mp2rss-worker.mjs" "$backup/worker/"
cp -a "$stage/.output" "$backup/new-output"
pm2 stop knowledge-base >/dev/null
trap 'pm2 start knowledge-base >/dev/null; systemctl start mp2rss-sync.timer' EXIT
mv "$base/.output" "$backup/output"
mv "$backup/new-output" "$base/.output"
for f in mp2rss-store.mjs mp2rss-batch.mjs mp-discovery.mjs mp-discovery-pipeline.mjs wechat-history.mjs wechat-identity.mjs; do
 cp "$stage/server/integrations/$f" "$base/server/integrations/$f"
 cp "$stage/server/integrations/$f" "$base/mp2rss-current/server/integrations/$f"
done
cp "$stage/scripts/mp2rss-worker.mjs" "$base/mp2rss-current/scripts/mp2rss-worker.mjs"
cp "$stage/scripts/mp2rss-worker.mjs" "$base/scripts/mp2rss-worker.mjs"
cp "$stage/pages/wechat/subscriptions.vue" "$base/pages/wechat/subscriptions.vue"
for f in MpSubscriptionBatch.vue MpDiscoveryPanel.vue; do cp "$stage/components/$f" "$base/components/$f"; done
for f in batch.post.ts discovery.get.ts; do cp "$stage/server/api/subscriptions/$f" "$base/server/api/subscriptions/$f"; done
echo 'Discovery deployed'
