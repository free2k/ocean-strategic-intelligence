import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {snapshotRules} from '../published-rules.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(root,'../..');
const snapshot=JSON.parse(await fs.readFile(path.join(repo,'.data/layout-preview.json'),'utf8'));
const data=snapshot.data||{},catalog=snapshot.catalog||{};
let ruleError=null;try{snapshotRules(catalog.ruleSnapshot||{});}catch(error){ruleError=error.message;}
const safeSource=s=>({id:s.id,name:s.name,url:s.url,method:s.method,status:s.status,checkedAt:s.checkedAt,scope:s.scope});
const payload={ruleError,rulePublication:catalog.ruleSnapshot?.industryRulePublication,downloadedAt:snapshot.downloadedAt,snapshotAt:data.generatedAt,errors:snapshot.errors,topics:data.topics||[],collection:data.collection,processing:data.processing,
 sources:(data.sources||[]).map(safeSource),documents:(catalog.documents||[]).map(d=>({...d,content:undefined,contentZh:undefined})),audit:catalog.audit,
 subscriptions:(snapshot.subscriptions?.list||[]).map(s=>({id:s.id,name:s.payload?.name||s.name||s.id,platform:s.payload?.platform||((s.id||'').startsWith('x:')?'x':'mp'),count:s.count,ready:s.ready,latest:s.latest,lastSync:s.last_sync,historyCount:s.legacy_count,payload:{name:s.payload?.name,platform:s.payload?.platform},enabled:s.enabled})),
 jobs:(snapshot.subscriptions?.jobs||[]).map(j=>({id:j.id,action:j.action,status:j.status,created_at:j.created_at,started_at:j.started_at,finished_at:j.finished_at,target:j.target,result:j.result,error:j.error})),subscriptionState:snapshot.subscriptions?.state,bridge:snapshot.subscriptions?.bridge,
 rss:snapshot.rss};
const assets={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/echarts.js':'../../node_modules/echarts/dist/echarts.min.js','/brand.png':'../public/wave-energy.png'};
http.createServer(async(req,res)=>{try{if(req.method!=='GET'){res.writeHead(405);res.end('Local preview is read-only');return;}const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');if(url.pathname==='/api/preview'){res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(payload));return;}const file=assets[url.pathname];if(!file){res.writeHead(404);res.end('Not found');return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.png')?'image/png':'text/html; charset=utf-8');res.end(await fs.readFile(path.resolve(root,file)));}catch{res.writeHead(500);res.end('Preview could not load');}}).listen(3121,'127.0.0.1',()=>console.log('Layout preview: http://127.0.0.1:3121/'));
