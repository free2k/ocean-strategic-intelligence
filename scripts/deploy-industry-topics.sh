#!/usr/bin/env bash
set -euo pipefail
base=/opt/knowledge-base
stage=$base/subscription-batch-stage
intel=/opt/ocean-intelligence/current
worker=$base/mp2rss-current
backup=$base/industry-topics-backup-$(date +%Y%m%dT%H%M%S)
mainfiles=(pages/articles.vue server/api/topics.get.ts server/api/articles/index.get.ts server/api/articles/export-count.post.ts server/api/articles/export-docx.post.ts server/api/articles/export-docx-stream.post.ts server/api/articles/export-summary.post.ts server/api/articles/export-summary-stream.post.ts intelligence/classification-jobs.mjs intelligence/industry-topics.mjs)
intelfiles=(intelligence/classification-jobs.mjs intelligence/industry-topics.mjs)
workerfiles=(intelligence/classification-jobs.mjs intelligence/industry-topics.mjs)

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
