import {sharedLowCarbon} from './low-carbon/shared-mode.mjs';
import {createHash} from 'node:crypto';
import {brandText,isLowCarbon} from './system-profile.mjs';
import {integrateOfficialCatalog} from './low-carbon/official-catalog.mjs';
// IEA_UNIFIED_V1
import {unifiedIEA,integrateIEACatalog} from './iea-quant.mjs';
import {gzipSync} from 'node:zlib';
import {selectRegistries} from './registry-evidence.mjs';
import {classifyRecord,compileRules,classifySnapshot} from './industry-classification.mjs';
import fs from 'node:fs/promises';import path from 'node:path';
import {buildCatalog} from './quant-preview/catalog.mjs';import {planTemplates} from './quant-preview/planner.mjs';import {filterData} from './core.mjs';import {selectSeries} from './series-evidence.mjs';
import {snapshotRules} from './published-rules.mjs';
const cache=new WeakMap();
export async function serveQuant(req,res,url,raw,root){
 if(!url.pathname.startsWith('/quant/'))return false;
 res.setHeader('X-Frame-Options','SAMEORIGIN');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'");
 if(req.method!=='GET'){res.writeHead(405);res.end();return true;}
 const route=url.pathname.slice(7);res.setHeader('Cache-Control','no-store');
 if(route==='api/iea-data'){res.setHeader('Content-Type','application/json; charset=utf-8');const body=JSON.stringify({...raw.ieaDatasets,feedCandidates:Object.values(raw.sourceCandidates||{}).filter(r=>r.sourceId?.startsWith('iaea-')),feedSources:raw.sources.filter(s=>s.id?.startsWith('iaea-'))});res.setHeader('Vary','Accept-Encoding');if(/\bgzip\b/.test(req.headers?.['accept-encoding']||'')){res.setHeader('Content-Encoding','gzip');res.end(gzipSync(body));}else res.end(body);return true;}
 if(route==='api/iea-file'){
 const hash=url.searchParams.get('hash')||'';
 if(!/^[a-f0-9]{64}$/.test(hash)||!(raw.ieaDatasets?.history||[]).some(h=>h.hash===hash)){res.writeHead(404);res.end();return true;}
 const home=process.env.IEA_DATA_HOME||path.join(process.env.INTEL_DATA_DIR||'.data/intelligence','iea');
 try{const bytes=await fs.readFile(path.join(home,'archive',hash+'.xlsx'));res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition','attachment; filename="IEA-'+hash.slice(0,12)+'.xlsx"');res.end(bytes);}catch{res.writeHead(404);res.end();}return true;
 }
 if(route==='api/catalog'){

  let catalog;try{const filters=Object.fromEntries(url.searchParams),config=snapshotRules(raw);if(raw._readVersion){const scope=Object.entries(filters).filter(([,v])=>v!==''&&v!==null&&v!==undefined).sort(([a],[b])=>a.localeCompare(b));const tag='\"catalog-'+createHash('sha256').update(JSON.stringify([raw._readVersion,raw._workspaceDelta?.revision,raw.insightRevision,compileRules(config).version,scope])).digest('hex')+'\"';res.setHeader('ETag',tag);if(req.headers?.['if-none-match']===tag){res.writeHead(304);res.end();return true;}}catalog=getQuantCatalog(raw,filters);}catch(error){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:error.message,code:'CLASSIFICATION_RULES_UNAVAILABLE'}));return true;}
  res.setHeader('Content-Type','application/json; charset=utf-8');const payload=JSON.stringify(catalog);res.setHeader('Vary','Accept-Encoding');if(/\bgzip\b/.test(req.headers?.['accept-encoding']||'')){res.setHeader('Content-Encoding','gzip');res.end(gzipSync(payload));}else res.end(payload);return true;
 }
 const assets=['index.html','app.js','catalog-read.js','entry.js','template-demos.js','iea-view.js','official-charts.js','chart-views.js','chart-rotation.js','chart-caption.js','data-workbench.js','charts.js','style.css'],file=route||'index.html';let target;
 if(assets.includes(file))target=path.join(root,'quant-preview',file);
 else if(file==='world.json')target=path.join(root,'public/world.json');
 else if(file==='echarts.js')target=path.join(root,'../node_modules/echarts/dist/echarts.min.js');
 else {res.writeHead(404);res.end();return true;}
 let bytes=await fs.readFile(target);if(file==='index.html')bytes=Buffer.from(bytes.toString().replaceAll('href="/','href="').replaceAll('src="/','src="').replace('<body>','<body class="embedded">'));
 if(/\.(html|css|js)$/.test(file))bytes=Buffer.from(brandText(bytes.toString()));
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.json')?'application/json':'text/html; charset=utf-8');res.end(bytes);return true;
}

export function getQuantCatalog(raw,filters={}){
 const config=snapshotRules(raw);
  raw=unifiedIEA(raw);const key=JSON.stringify(Object.entries(filters).filter(([,value])=>value!==''&&value!==null&&value!==undefined).sort(([a],[b])=>a.localeCompare(b)));let records=cache.get(raw);if(!records){records=new Map();cache.set(raw,records);}let catalog=records.get(key);
  if(!catalog){const filtered=filterData({...raw,ieaDatasets:undefined,insightEdits:undefined},filters);filtered.series=selectSeries({...raw,series:classifySnapshot({...raw,ieaDatasets:undefined,insightEdits:undefined,documents:[]},config).series.map(s=>({...s,topic:s.industry.primary||s.topic}))},filters);filtered.assetRegistries=selectRegistries(raw,filters);catalog=buildCatalog(filtered,config);const auditScope=filterData({...raw,insightEdits:undefined,documents:raw.documents.map(({industry,...d})=>industry?.manual||(isLowCarbon&&d.fullBodyAvailable)?{...d,industry}:d)},{...filters,topic:''}),rules=compileRules(config);const auditDocuments=auditScope.documents.map(d=>{const classification=d.industry?.manual||(isLowCarbon&&d.fullBodyAvailable&&d.industry)?d.industry:classifyRecord(d,rules);return {id:d.id,title:d.titleZh||d.title,url:d.url,sourceId:d.sourceId,topic:classification.primary,classification};});catalog={...catalog,...planTemplates(catalog),auditDocuments,ruleSnapshot:{industryRuleConfig:config,industryRuleVersion:raw.industryRuleVersion,industryRulePublication:raw.industryRulePublication},production:true,insightRevision:raw.insightRevision||null};catalog=integrateIEACatalog(catalog,raw,filters);if(isLowCarbon)catalog=integrateOfficialCatalog(catalog,raw,filters);if(records.size>=(sharedLowCarbon?1:21))records.clear();records.set(key,catalog);}
 return catalog;
}
