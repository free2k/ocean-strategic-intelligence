import http from 'node:http';
import fs from 'node:fs';
import fileIO from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {authenticated} from './sensing-page-reader.mjs';
import {createEvidenceIndex,createEvidenceIndexAsync,queryEvidence,evidencePeriodPreview,evidenceReportList,compactEvidenceReport} from './evidence-page-query.mjs';

// This worker reads fixed private files only. Filtering and brief previews are
// reads of saved decisions; no database, collection or model client is opened.
export function createEvidencePageReader({dir,scope,auth={},refresh=async()=>{},capabilities={},ttl=30000,clock=Date.now}={}){
 const inventoryFile=path.join(dir,'evidence-page.json'),reportsFile=path.join(dir,'period-reports','runtime.json');
 let saved,index,inventoryKey='',reportKey='',reports={},reportList=[],pending=null,loading=null,dirty=false,error=null,epoch=0;
 const encoded=new Map(),compact=new Map();
 const key=stat=>[stat.ino,stat.mtimeMs,stat.size].join(':');
 function validate(next){if(next.schema!==1||next.scope!==scope||!Array.isArray(next.payload?.inventory?.documents))throw Error('EVIDENCE_VIEW_IDENTITY_MISMATCH');}
 function prepareInventory(){
  const stamp=key(fs.statSync(inventoryFile));
  if(stamp!==inventoryKey){const next=JSON.parse(fs.readFileSync(inventoryFile,'utf8'));validate(next);const nextIndex=createEvidenceIndex(next.payload.inventory);saved=next;index=nextIndex;inventoryKey=stamp;encoded.clear();}
  return saved;
 }
 function checkIdentityHeader(){const fd=fs.openSync(inventoryFile,'r');try{const buffer=Buffer.alloc(512),length=fs.readSync(fd,buffer,0,512,0),prefix=buffer.subarray(0,length).toString('utf8'),match=prefix.match(/^\{"schema":1,"scope":("(?:[^"\\]|\\.)*")/);if(match&&JSON.parse(match[1])!==scope)throw Error('EVIDENCE_VIEW_IDENTITY_MISMATCH');}finally{fs.closeSync(fd);}}
 function reloadIndex(){
  if(loading)return loading;
  const task=(async()=>{const stamp=key(await fileIO.stat(inventoryFile)),next=JSON.parse(await fileIO.readFile(inventoryFile,'utf8'));validate(next);const nextIndex=await createEvidenceIndexAsync(next.payload.inventory);if(key(await fileIO.stat(inventoryFile))!==stamp)return;saved=next;index=nextIndex;inventoryKey=stamp;encoded.clear();})();
  loading=task;task.finally(()=>{if(loading===task)loading=null;}).catch(()=>{});return task;
 }
 async function freshIndex(){while(key(await fileIO.stat(inventoryFile))!==inventoryKey){await reloadIndex();}}
 function inventory(){
  if(!saved)return prepareInventory();
  const stamp=key(fs.statSync(inventoryFile));if(stamp!==inventoryKey){checkIdentityHeader();void reloadIndex().catch(()=>{error='文章目录更新暂未完成，当前显示上次成功读取的记录。';});}
  return saved;
 }
 function readReports(){
  let stamp;try{stamp=key(fs.statSync(reportsFile));}catch(e){if(e.code!=='ENOENT')throw e;stamp='missing';}
  if(stamp!==reportKey){const value=stamp==='missing'?{}:JSON.parse(fs.readFileSync(reportsFile,'utf8'));reports=value.periodReports||{};reportList=evidenceReportList(reports);reportKey=stamp;compact.clear();encoded.clear();}
 }
 function summary(id){const job=reports[id];if(!job)return null;if(!compact.has(id))compact.set(id,compactEvidenceReport(job));return compact.get(id);}
 function requestRefresh(){
  if(pending)return pending;const generation=epoch,task=Promise.resolve().then(refresh).then(async()=>{await freshIndex();if(generation===epoch){dirty=false;error=null;}}).catch(()=>{error='文章目录更新暂未完成，当前显示上次成功读取的记录。';});
  pending=task;task.finally(()=>{if(pending===task)pending=null;});return task;
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Evidence-Reader','1');
  function json(code,value){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
  let url;try{url=new URL(req.url,'http://localhost');}catch{return json(400,{error:'无效的读取地址'});}
  if(url.pathname==='/health'&&req.method==='GET')return json(200,{ok:true,readOnly:true});
  if(!['/api/evidence-page','/api/evidence-period','/api/evidence-report','/api/evidence-report-document'].includes(url.pathname))return json(404,{error:'页面不存在'});
  if(!authenticated(req,auth))return json(401,{error:'请先登录研究空间'});
  if(req.method!=='GET'){res.setHeader('Allow','GET');return json(405,{error:'此接口只读取已保存资料'});}
  try{
   const params=Object.fromEntries(url.searchParams);
   if(params.refresh==='1'){epoch++;dirty=true;if(pending)await pending;await requestRefresh();if(error)throw Error('EVIDENCE_REFRESH_UNAVAILABLE');}
   if(['/api/evidence-page','/api/evidence-period'].includes(url.pathname)){inventory();if(dirty||clock()-saved.at>=ttl)void requestRefresh();}
   if(url.pathname!=='/api/evidence-page')readReports();
   const view={version:saved?.version,refreshing:!!pending||!!loading,error},cacheKey=JSON.stringify([url.pathname,[...url.searchParams].filter(([k])=>k!=='refresh').sort(),inventoryKey,reportKey,view,url.pathname==='/api/evidence-period'?new Date(clock()+8*3600000).toISOString().slice(0,10):null]);
   let response=encoded.get(cacheKey);
   if(!response){let value;
    if(url.pathname==='/api/evidence-page')value=params.view==='source-index'?{documents:index.sourceIndex,observedAt:index.inventory.observedAt}:{...queryEvidence(index,params),pageView:view};
    if(url.pathname==='/api/evidence-period'&&params.view==='history')value={items:reportList};
    if(url.pathname==='/api/evidence-period'&&params.view!=='history'){
     const preview=evidencePeriodPreview(index,params,capabilities,new Date(clock())),matches=reportList.filter(j=>j.range.from===preview.range.from&&j.range.to===preview.range.to),selected=matches.find(j=>j.status==='published')||matches[0];
     value={items:reportList,preview,current:selected?summary(selected.id):null,pageView:view};
    }
    if(url.pathname==='/api/evidence-report'){value=summary(params.id);if(!value)return json(404,{error:'未找到已保存的简报'});}
    if(url.pathname==='/api/evidence-report-document'){const job=reports[params.report],entry=job?.documents?.find(d=>d.documentId===params.document);if(!entry)return json(404,{error:'未找到本次简报保存的原文'});value={reportId:job.id,releaseId:job.releaseId,document:entry};}
    const body=Buffer.from(JSON.stringify(value));response={body,gzip:gzipSync(body),etag:'"evidence-'+createHash('sha256').update(body).digest('hex')+'"'};encoded.set(cacheKey,response);if(encoded.size>32)encoded.delete(encoded.keys().next().value);
   }
   res.setHeader('ETag',response.etag);res.setHeader('Vary','Accept-Encoding');
   if(req.headers['if-none-match']===response.etag){res.writeHead(304);res.end();return;}
   const gzip=/\bgzip\b/.test(req.headers['accept-encoding']||'');res.writeHead(200,{'Content-Type':'application/json; charset=utf-8',...(gzip?{'Content-Encoding':'gzip'}:{})});res.end(gzip?response.gzip:response.body);
  }catch(e){return json(e.status||503,{error:e.status?e.message:'证据目录暂不可用，请稍后重试；已保存的分类与简报保持不变。'});}
 });
 server.prepare=()=>{prepareInventory();readReports();};
 server.invalidate=()=>{epoch++;dirty=true;};
 return server;
}
