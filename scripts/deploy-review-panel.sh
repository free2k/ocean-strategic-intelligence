#!/bin/bash
set -euo pipefail
stage=/opt/ocean-intelligence/review-panel-stage
dest=/opt/ocean-intelligence/current
backup=/opt/ocean-intelligence/review-panel-backup-$(date +%Y%m%dT%H%M%S)
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -w 50 9 || { echo 'Maintenance busy; retry deployment'; exit 1; }
mkdir -p "$backup"
files=(intelligence/server.mjs intelligence/classification-audit.mjs intelligence/public/classification-current.js intelligence/public/classification-review.js)
for f in "${files[@]}";do node --check "$stage/$f";mkdir -p "$backup/$(dirname "$f")";if test -f "$dest/$f";then cp "$dest/$f" "$backup/$f";fi;done
pm2 stop ocean-intelligence >/dev/null
finish(){ code=$?;if [ "$code" -ne 0 ];then cp -a "$backup/." "$dest/";fi;pm2 restart ocean-intelligence >/dev/null;exit "$code";}
trap finish EXIT
for f in "${files[@]}";do cp "$stage/$f" "$dest/$f";done
echo "Review panel deployed; backup $backup"
