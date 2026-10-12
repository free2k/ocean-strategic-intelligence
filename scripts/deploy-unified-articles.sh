#!/usr/bin/env bash
set -euo pipefail
base=/opt/knowledge-base
stage=$base/subscription-batch-stage
backup=$base/unified-articles-backup-$(date +%Y%m%dT%H%M%S)
files=(components/MpSubscriptionsHome.vue components/MpClassificationReason.vue pages/wechat/subscription-articles.vue server/api/subscriptions/items.get.ts server/integrations/subscription-history.mjs server/integrations/subscription-articles.mjs)
test -f "$stage/.output/server/index.mjs"
mkdir -p "$backup"
cp -a "$stage/.output" "$backup/new-output"
for file in "${files[@]}"; do if test -f "$base/$file"; then mkdir -p "$backup/$(dirname "$file")"; cp "$base/$file" "$backup/$file"; fi; done
pm2 stop knowledge-base >/dev/null
trap 'pm2 start knowledge-base >/dev/null' EXIT
mv "$base/.output" "$backup/output"
mv "$backup/new-output" "$base/.output"
for file in "${files[@]}"; do cp "$stage/$file" "$base/$file"; done
echo 'Unified article history and compact subscription table deployed'
