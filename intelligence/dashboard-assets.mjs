import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
// Only the public module graph used by the workspace entry is served here.
// Database handlers, configuration, uploads and arbitrary paths are excluded.
const publicModules=('app system-api subsystem-switch multi-select strategy-workbench country-dossier monitor-overview object-browser navigation home change-signals preview sensing globe file-intake country-map x-evidence-view statistical-views interactions enhancements object-supplement object-fields dossier-view country-assessment classification-current research-replay classification-review period-reports rule-editor brief-view period-charts processing-runs').split(' ').map(n=>n+'.js');
const strategyModules=('scope-state wizard evaluation-case-view state case-view discovery case-workflow results matrix task-map guided-inputs scope-fields advisor').split(' ').map(n=>'strategy/'+n+'.js');
const publicPaths=new Set([...publicModules,...strategyModules,'country-ranking.mjs','dashboard-codec.mjs','workspace-read.js']);
const rootPaths=new Set(['industry-topics.mjs','system-profile.mjs','low-carbon/taxonomy.mjs','low-carbon/lexicon.mjs']);
const quantPaths=new Set(('index.html style.css app.js catalog-read.js entry.js template-demos.js iea-view.js official-charts.js chart-views.js chart-rotation.js chart-caption.js data-workbench.js data-import.js charts.js echarts.js').split(' ').map(name=>'quant/'+name));
export function createDashboardAssets(root,{brandText=text=>text}={}){
 const cached=new Map(),pending=new Map();
 return async name=>{
  const file=name==='quant/echarts.js'?path.join(root,'../node_modules/echarts/dist/echarts.min.js'):publicPaths.has(name)?path.join(root,'public',name):rootPaths.has(name)?path.join(root,name):quantPaths.has(name)?path.join(root,'quant-preview',name.slice(6)):null;
  if(!file)return null;
  const stat=await fs.stat(file),identity=stat.mtimeMs+':'+stat.size,old=cached.get(name);if(old?.identity===identity)return old;
  const key=name+':'+identity;if(!pending.has(key))pending.set(key,(async()=>{let raw=await fs.readFile(file);if(name==='quant/index.html')raw=Buffer.from(raw.toString().replaceAll('href="/','href="').replaceAll('src="/','src="').replace('<body>','<body class="embedded">'));if(/\.(js|css|html)$/.test(name))raw=Buffer.from(brandText(raw.toString()));const contentType=name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8';const asset={identity,contentType,raw,gzip:gzipSync(raw),etag:'"asset-'+createHash('sha256').update(raw).digest('hex')+'"'};cached.set(name,asset);return asset;})().finally(()=>pending.delete(key)));
  return pending.get(key);
 };
}
