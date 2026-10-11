#!/bin/bash
set -euo pipefail
exec 9>/opt/ocean-intelligence/eia-daily.lock
flock -n 9 || { echo 'Collection running; no changes made'; exit 1; }
root=/opt/ocean-intelligence/current
stage=/opt/ocean-intelligence/quant-usability-stage
backup=/opt/ocean-intelligence/quant-usability-backups/$(date +%Y%m%dT%H%M%S)
files='intelligence/quant-routes.mjs intelligence/quant-preview/planner.mjs intelligence/quant-preview/app.js intelligence/quant-preview/charts.js intelligence/quant-preview/template-demos.js intelligence/quant-preview/style.css intelligence/quant-preview/index.html'
mkdir -p "$backup"
for file in $files; do case "$file" in *.js|*.mjs) node --check "$stage/$file";; esac; if [ -f "$root/$file" ]; then mkdir -p "$backup/$(dirname "$file")"; cp "$root/$file" "$backup/$file"; fi; done
pm2 stop ocean-intelligence >/dev/null
trap 'pm2 restart ocean-intelligence >/dev/null' EXIT
for file in $files; do cp "$stage/$file" "$root/$file"; done
mkdir -p "$backup/intelligence/public"
cp "$root/intelligence/public/app.js" "$root/intelligence/public/style.css" "$backup/intelligence/public/"
cd "$root"
node --input-type=module <<'NODE'
import fs from 'node:fs';
const p='intelligence/public/app.js';let s=fs.readFileSync(p,'utf8');if(!s.includes('document.body.dataset.view=tab;'))s=s.replace("$('#page-name').textContent=names[tab];","document.body.dataset.view=tab;$('#page-name').textContent=names[tab];");s=s.replace("$('.hero').hidden=tab==='research';","$('.hero').hidden=tab==='research'||tab==='analysis';");fs.writeFileSync(p,s);
const css='intelligence/public/style.css';s=fs.readFileSync(css,'utf8');if(!s.includes('统一控制真实图表和数据明细'))fs.writeFileSync(css,s+'\nbody[data-view="analysis"] .filters{padding:18px 20px;border:1px solid var(--line);border-radius:14px;background:var(--panel);margin-top:0}\nbody[data-view="analysis"] .filters::before{content:"数据范围 · 统一控制真实图表和数据明细";flex-basis:100%;font-size:12px;color:var(--accent);margin-bottom:4px}\nbody[data-view="analysis"] #notice{display:none}\n');
NODE
echo "Quantitative UI updated; backup: $backup"
