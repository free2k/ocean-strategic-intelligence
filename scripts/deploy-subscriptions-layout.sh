#!/usr/bin/env bash
set -euo pipefail
base=/opt/knowledge-base
stage=$base/subscription-batch-stage
test -f "$stage/.output/server/index.mjs"
backup=$base/subscriptions-layout-backup-$(date +%Y%m%dT%H%M%S)
mkdir -p "$backup"
cp -a "$stage/.output" "$backup/new-output"
cp "$base/pages/wechat/subscriptions.vue" "$backup/subscriptions.vue"
pm2 stop knowledge-base >/dev/null
trap 'pm2 start knowledge-base >/dev/null' EXIT
mv "$base/.output" "$backup/output"
mv "$backup/new-output" "$base/.output"
for f in MpSubscriptionsHome.vue MpEvidenceDetails.vue MpSubscriptionBatch.vue; do cp "$stage/components/$f" "$base/components/$f"; done
for f in subscriptions.vue subscription-articles.vue; do cp "$stage/pages/wechat/$f" "$base/pages/wechat/$f"; done
cp "$stage/pages/wechat.vue" "$base/pages/wechat.vue"
cp "$stage/components/wechat/WechatSideNav.vue" "$base/components/wechat/WechatSideNav.vue"
echo 'Subscription layout deployed'
