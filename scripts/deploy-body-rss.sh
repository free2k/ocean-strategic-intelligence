#!/usr/bin/env bash
set -euo pipefail
base=/opt/knowledge-base
stage=$base/subscription-batch-stage
backup=$base/body-rss-backup-$(date +%Y%m%dT%H%M%S)
test -f "$stage/.output/server/index.mjs"
mkdir -p "$backup"
cp -a "$stage/.output" "$backup/new-output"
files=(components/MpSubscriptionsHome.vue pages/wechat/rss.vue pages/wechat/subscription-articles.vue server/api/rss/sources.get.ts server/api/rss/sync.post.ts server/api/subscriptions/body.post.ts server/api/subscriptions/items.get.ts server/integrations/mp2rss-store.mjs server/integrations/subscription-history.mjs)
for file in "${files[@]}"; do if test -f "$base/$file"; then mkdir -p "$backup/$(dirname "$file")"; cp "$base/$file" "$backup/$file"; fi; done
cp "$base/mp2rss-current/server/integrations/mp2rss-store.mjs" "$backup/worker-store.mjs"
# Install the dependency before atomically replacing the worker module for its next run.
cp "$stage/server/integrations/subscription-history.mjs" "$base/mp2rss-current/server/integrations/subscription-history.mjs"
cp "$stage/server/integrations/mp2rss-store.mjs" "$base/mp2rss-current/server/integrations/mp2rss-store.next.mjs"
mv "$base/mp2rss-current/server/integrations/mp2rss-store.next.mjs" "$base/mp2rss-current/server/integrations/mp2rss-store.mjs"
pm2 stop knowledge-base >/dev/null
trap 'pm2 start knowledge-base >/dev/null' EXIT
mv "$base/.output" "$backup/output"
mv "$backup/new-output" "$base/.output"
for file in "${files[@]}"; do cp "$stage/$file" "$base/$file"; done
echo 'Body completion and unified RSS inventory deployed'
