#!/bin/bash
set -euo pipefail
stage=/opt/knowledge-base/context-rule-stage
base=/opt/knowledge-base
intel=/opt/ocean-intelligence/current
worker=/opt/knowledge-base/mp2rss-current
backup=/opt/knowledge-base/context-rule-backup-$(date +%Y%m%dT%H%M%S)
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -w 45 9 || { echo 'Maintenance busy'; exit 1; }
test -f "$stage/.output/server/index.mjs"
if systemctl is-active --quiet mp2rss-sync.service; then echo 'Subscription worker active; retry later'; exit 1; fi
mkdir -p "$backup"
systemctl stop mp2rss-sync.timer
pm2 stop ocean-intelligence >/dev/null
pm2 stop knowledge-base >/dev/null
finish(){
 code=$?
 if [ "$code" -ne 0 ]; then
   for spec in "main:$base" "intel:$intel" "worker:$worker"; do name=${spec%%:*};dest=${spec#*:};if test -d "$backup/$name";then cp -a "$backup/$name/." "$dest/";fi;done
   if test -d "$backup/output";then mv "$base/.output" "$backup/failed-output";mv "$backup/output" "$base/.output";fi
 fi
 pm2 restart knowledge-base >/dev/null
 pm2 restart ocean-intelligence >/dev/null
 systemctl start mp2rss-sync.timer
 exit "$code"
}
trap finish EXIT
copy(){ name=$1;dest=$2;shift 2;for f in "$@";do mkdir -p "$backup/$name/$(dirname "$f")" "$dest/$(dirname "$f")";if test -f "$dest/$f";then cp "$dest/$f" "$backup/$name/$f";fi;cp "$stage/$f" "$dest/$f";done;}
copy main "$base" intelligence/industry-classification.mjs components/AdminFiltersTab.vue server/api/filters/index.get.ts 'server/api/filters/[id].put.ts' 'server/api/filters/[id].delete.ts'
copy intel "$intel" intelligence/industry-classification.mjs intelligence/public/rule-editor.js intelligence/research/routes.mjs
copy worker "$worker" intelligence/industry-classification.mjs
mv "$base/.output" "$backup/output"
mv "$stage/.output" "$base/.output"
cd "$base"
node --env-file=.env "$stage/scripts/install-context-rule.mjs"
echo "Deployed common context management. Backup: $backup"
