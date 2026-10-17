#!/bin/bash
set -euo pipefail
root=/opt/ocean-intelligence/current
stage=/opt/ocean-intelligence/insight-workbench-stage
backup=/opt/ocean-intelligence/insight-workbench-backups/$(date +%Y%m%dT%H%M%S)
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -w 50 9 || { echo 'Collection busy; retry later'; exit 1; }
files='intelligence/insight-data.mjs intelligence/store.mjs intelligence/quant-routes.mjs intelligence/public/style.css intelligence/quant-preview/app.js intelligence/quant-preview/chart-views.js intelligence/quant-preview/charts.js intelligence/quant-preview/data-workbench.js intelligence/quant-preview/index.html intelligence/quant-preview/official-charts.js intelligence/quant-preview/planner.mjs intelligence/quant-preview/style.css intelligence/quant-preview/template-demos.js'
mkdir -p "$backup"
for f in $files; do
 case "$f" in *.js|*.mjs) node --check "$stage/$f";; esac
 mkdir -p "$backup/$(dirname "$f")"
 if test -f "$root/$f"; then cp "$root/$f" "$backup/$f"; else echo "$f" >> "$backup/new-files.txt"; fi
done
cp "$root/intelligence/server.mjs" "$backup/intelligence/server.mjs"
cp /opt/ocean-intelligence/data/snapshot.json "$backup/snapshot.json"
rollback(){ code=$?; if [ "$code" -ne 0 ]; then
 cp -a "$backup/intelligence/." "$root/intelligence/"
 if test -f "$backup/new-files.txt"; then while IFS= read -r f; do rm -f "$root/$f"; done < "$backup/new-files.txt"; fi
 pm2 restart ocean-intelligence >/dev/null
 echo "Rolled back code; backup: $backup"
 fi; exit "$code"; }
trap rollback EXIT
pm2 stop ocean-intelligence >/dev/null
for f in $files; do cp "$stage/$f" "$root/$f"; done
cd "$root"
node --input-type=module <<'NODE'
import fs from 'node:fs';
const p='intelligence/server.mjs';let s=fs.readFileSync(p,'utf8');
if(!s.includes("import {serveInsightData}"))s="import {serveInsightData} from './insight-data.mjs';\n"+s;
if(!s.includes('if(await serveInsightData(')){
 const marker="  if(route==='/api/object-supplements'";
 const fallback=" if(route==='/api/object-supplements'";
 const target=s.includes(marker)?marker:fallback;
 if(!s.includes(target))throw Error('Server insertion point missing');
 s=s.replace(target," if(await serveInsightData(req,res,url,{store,serial,body,json}))return;\n"+target);
}
fs.writeFileSync(p,s);
NODE
node --check intelligence/server.mjs
pm2 restart ocean-intelligence >/dev/null
for i in $(seq 1 45); do
 if curl -fsS --max-time 2 http://127.0.0.1:3101/api/health > "$backup/health.json"; then
  echo "Insight workbench deployed; backup: $backup"; exit 0
 fi
 sleep 1
done
echo 'Health check failed'; exit 1
