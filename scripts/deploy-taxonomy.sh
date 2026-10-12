#!/usr/bin/env bash
set -euo pipefail
base=/opt/knowledge-base
stage=$base/subscription-batch-stage
intel=/opt/ocean-intelligence/current
worker=$base/mp2rss-current
backup=$base/taxonomy-backup-$(date +%Y%m%dT%H%M%S)
mainfiles=(intelligence/industry-topics.mjs intelligence/industry-classification.mjs intelligence/semantic-classification.mjs intelligence/classification-jobs.mjs intelligence/core.mjs intelligence/server.mjs intelligence/auto-extract.mjs intelligence/collect.mjs intelligence/collect-eia-news.mjs intelligence/file-intake.mjs intelligence/public/app.js intelligence/public/enhancements.js intelligence/public/x-evidence-view.js intelligence/quant-preview/app.js components/AdminFiltersTab.vue server/api/filters/index.get.ts server/api/filters/index.post.ts server/api/filters/[id].put.ts server/api/filters/import.post.ts server/api/filters/seed.post.ts server/api/filters/apply.post.ts server/api/filters/apply-stream.post.ts server/api/articles/manual-classify.post.ts server/utils/classification.ts server/api/stats/categories.get.ts components/MpClassificationReason.vue)
intelfiles=(intelligence/industry-topics.mjs intelligence/industry-classification.mjs intelligence/semantic-classification.mjs intelligence/classification-jobs.mjs intelligence/core.mjs intelligence/server.mjs intelligence/auto-extract.mjs intelligence/collect.mjs intelligence/collect-eia-news.mjs intelligence/file-intake.mjs intelligence/public/app.js intelligence/public/enhancements.js intelligence/public/x-evidence-view.js intelligence/quant-preview/app.js)
workerfiles=(intelligence/industry-topics.mjs intelligence/industry-classification.mjs intelligence/semantic-classification.mjs intelligence/classification-jobs.mjs intelligence/core.mjs)

test -f "$stage/.output/server/index.mjs"
for f in "${mainfiles[@]}" "${intelfiles[@]}" "${workerfiles[@]}"; do test -f "$stage/$f"; done
mkdir -p "$backup"
cp -a "$stage/.output" "$backup/new-output"
# Use the same lock as the intelligence scheduler; never replace a running snapshot job.
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -w 50 9
systemctl stop mp2rss-sync.timer
systemctl stop mp2rss-sync.service
pm2 stop ocean-intelligence >/dev/null
pm2 stop knowledge-base >/dev/null
rollback(){
 code=$?
 if [ "$code" -ne 0 ]; then
  if test -d "$backup/output"; then mv "$base/.output" "$backup/failed-output"; mv "$backup/output" "$base/.output"; fi
  for pair in "main:$base" "intel:$intel" "worker:$worker"; do name=${pair%%:*}; dest=${pair#*:}; if test -d "$backup/$name"; then cp -a "$backup/$name/." "$dest/"; fi; done
 fi
 pm2 start knowledge-base >/dev/null
 pm2 start ocean-intelligence >/dev/null
 systemctl start mp2rss-sync.timer
 exit "$code"
}
trap rollback EXIT
copy_files(){ name=$1; dest=$2; shift 2; for f in "$@"; do mkdir -p "$backup/$name/$(dirname "$f")" "$dest/$(dirname "$f")"; if test -f "$dest/$f"; then cp "$dest/$f" "$backup/$name/$f"; fi; cp "$stage/$f" "$dest/$f"; done; }
copy_files main "$base" "${mainfiles[@]}"
copy_files intel "$intel" "${intelfiles[@]}"
copy_files worker "$worker" "${workerfiles[@]}"
cp /opt/ocean-intelligence/data/snapshot.json "$backup/intelligence-snapshot.json"
mv "$base/.output" "$backup/output"
mv "$backup/new-output" "$base/.output"
echo "Classification workflow deployed; backup: $backup"
