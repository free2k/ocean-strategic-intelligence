#!/usr/bin/env bash
set -euo pipefail
base=/opt/knowledge-base
stage=$base/multi-account-stage
worker=$base/mp2rss-current
backup=$base/multi-account-backup-$(date +%Y%m%dT%H%M%S)
test -f "$stage/.output/server/index.mjs"
mkdir -p "$backup"
cp -a "$stage/.output" "$backup/new-output"
systemctl stop mp2rss-sync.timer
resume(){ systemctl start mp2rss-sync.timer; }
trap resume EXIT
for ((i=0;i<60;i++)); do
 state=$(systemctl is-active mp2rss-sync.service || true)
 if [[ "$state" != active && "$state" != activating ]]; then break; fi
 sleep 5
done
state=$(systemctl is-active mp2rss-sync.service || true)
if [[ "$state" == active || "$state" == activating ]]; then echo 'Worker still running; deployment deferred'; exit 1; fi
for dir in "$base" "$worker"; do
 name=main; [[ "$dir" == "$worker" ]] && name=worker
 mkdir -p "$backup/$name"
 cp "$dir/server/integrations/mp2rss-client.mjs" "$backup/$name/mp2rss-client.mjs"
done
pm2 stop knowledge-base >/dev/null
rollback(){
 code=$?
 if ((code!=0)); then
  if test -d "$backup/output"; then
   if test -d "$base/.output"; then mv "$base/.output" "$backup/failed-output"; fi
   mv "$backup/output" "$base/.output"
  fi
  cp "$backup/main/mp2rss-client.mjs" "$base/server/integrations/mp2rss-client.mjs"
  cp "$backup/worker/mp2rss-client.mjs" "$worker/server/integrations/mp2rss-client.mjs"
 fi
 pm2 start knowledge-base >/dev/null
 systemctl start mp2rss-sync.timer
 exit "$code"
}
trap rollback EXIT
for dir in "$base" "$worker"; do
 cp "$stage/server/integrations/mp2rss-accounts.mjs" "$dir/server/integrations/"
 cp "$stage/server/integrations/mp2rss-client.mjs" "$dir/server/integrations/"
done
mv "$base/.output" "$backup/output"
mv "$backup/new-output" "$base/.output"
cd "$base"
node --env-file=.env scripts/activate-mp-accounts.mjs
echo "Multi-account deployment complete; backup: $backup"
