import {standardTopics,marineContextPattern,supplementalRules} from '../industry-topics.mjs';
import {compileRules} from '../industry-classification.mjs';
import {readHistoricalBatches} from './historical-products.mjs';
import {readCountries} from './countries.mjs';
import {readProductCatalog} from './product-catalog.mjs';
import {readMonitorSummary} from './monitor-summary.mjs';
import {LedgerError,fail} from './ledger.mjs';
import {randomUUID} from 'node:crypto';
import {readBatchReplay} from './replay.mjs';
import {readBriefs} from './brief-products.mjs';
import {readObjects} from './objects.mjs';
const send=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-cache',...headers});res.end(data===null?'':JSON.stringify(data));};
const allowed=new Set(['releaseId','snapshotId']);
export async function serveResearchRead(req,res,url,ledger,journal=null){
 const route=url.pathname;
 const match=route.match(/^\/api\/document\/([^/]+)\/versions\/([^/]+)$/);
 const batch=route.match(/^\/api\/batches\/([^/]+)$/);
 const object=route.match(/^\/api\/research\/objects\/([^/]+)$/);
 if(!match&&!batch&&!object&&!['/api/research/rules','/api/research/historical','/api/research/products','/api/research/countries','/api/research/monitor-summary','/api/batches','/api/research/releases','/api/snapshots/latest-version','/api/research/summary','/api/research/replay','/api/research/briefs','/api/research/objects'].includes(route))return false;
 try{
  if(req.method!=='GET')fail('METHOD_NOT_ALLOWED','Only GET is supported',405);
  if(route==='/api/batches'||batch?.[1].startsWith('task_')){
   if(!journal)fail('TASKS_NOT_INITIALIZED','持久处理批次尚未启用',503);
   if(batch){if(url.searchParams.size)fail('UNSUPPORTED_SCOPE','任务状态查询不接受成果版本参数');const data=await journal.get(batch[1]);send(res,200,{data,meta:{kind:'processing_task',immutable:false}});}
   else{for(const key of url.searchParams.keys())if(!['limit','cursor','status'].includes(key))fail('UNSUPPORTED_SCOPE','不支持的任务筛选参数：'+key);send(res,200,{...await journal.list(Object.fromEntries(url.searchParams)),meta:{kind:'processing_tasks',immutable:false}});}
   return true;
  }
  if(!ledger)fail('RESEARCH_NOT_INITIALIZED','研究版本库尚未启用；当前页面仍使用原有资料接口',503);
  if(route==='/api/research/releases'){
   for(const key of url.searchParams.keys())if(key!=='cursor')fail('UNSUPPORTED_SCOPE','发布历史仅接受分页游标');
   let release=await ledger.resolveRelease(url.searchParams.get('cursor')?{releaseId:url.searchParams.get('cursor')}:{}),data=[];
   while(release&&data.length<20){data.push({releaseId:release.releaseId,batchId:release.batchId,snapshotId:release.snapshotId,publishedAt:release.publishedAt,productStatus:release.productStatus});release=release.previousReleaseId?await ledger.repository.read(release.previousReleaseId):null;}
   send(res,200,{data,nextCursor:release?.releaseId||null});return true;
  }
  if(route==='/api/research/historical'){send(res,200,await readHistoricalBatches(ledger,Object.fromEntries(url.searchParams)));return true;}
  if(route==='/api/research/countries'){send(res,200,await readCountries(ledger,Object.fromEntries(url.searchParams)));return true;}
  if(route==='/api/research/monitor-summary'){send(res,200,await readMonitorSummary(ledger,Object.fromEntries(url.searchParams)));return true;}
  if(object||route==='/api/research/objects'){send(res,200,await readObjects(ledger,Object.fromEntries(url.searchParams),object?.[1]));return true;}
  if(route==='/api/research/briefs'){send(res,200,await readBriefs(ledger,Object.fromEntries(url.searchParams)));return true;}
  for(const key of url.searchParams.keys())if(!allowed.has(key)&&!(route==='/api/research/replay'&&['topic','sourceId','from','to','country'].includes(key)))fail('UNSUPPORTED_SCOPE','此基础接口暂不支持该筛选参数：'+key);
  const versions=Object.fromEntries(url.searchParams);
  if(route==='/api/research/rules'){
   const {release,snapshot}=await ledger.resolve(versions);
   const config=snapshot.ruleConfig;
   if(!Array.isArray(config?.rules))fail('RULES_UNAVAILABLE','此版本未保存匹配规则',503);
   const policyMatches=compileRules(config).version===snapshot.ruleVersion;
   const context=config.rules.filter(r=>r.type==='context');
   const contextText=context.length?context.filter(r=>r.enabled!==false).map(r=>'标题：'+(r.title_keywords||r.titleKeywords||[]).join('、')+'；正文前1800字符：'+(r.content_keywords||r.contentKeywords||[]).join('、')).join('；')||'已停用，规则不直接通过语境门槛':marineContextPattern;
   send(res,200,{data:{rules:config.rules,domains:standardTopics,policyMatches,supplementalRules:policyMatches?supplementalRules:[],marineContextPattern:policyMatches?contextText:null},meta:{releaseId:release.releaseId,publishedAt:release.publishedAt,ruleVersion:snapshot.ruleVersion}});return true;
  }
  if(route==='/api/research/products'){send(res,200,await readProductCatalog(ledger,versions));return true;}
  if(route==='/api/research/replay'){const result=await readBatchReplay(ledger,versions),etag='"'+result.meta.releaseId+':'+result.meta.scope.scopeHash+'"';send(res,req.headers['if-none-match']===etag?304:200,req.headers['if-none-match']===etag?null:result,{ETag:etag});return true;}
  if(batch){const release=await ledger.resolveRelease(versions);if(release.batchId!==batch[1])fail('VERSION_CONFLICT','Batch is not part of the selected release',409);send(res,200,{data:await ledger.batch(batch[1]),meta:{releaseId:release.releaseId,snapshotId:release.snapshotId}});return true;}
  if(match){send(res,200,await ledger.document(decodeURIComponent(match[1]),match[2],versions));return true;}
  const release=await ledger.resolveRelease(versions);
  const meta={releaseId:release.releaseId,snapshotId:release.snapshotId,batchId:release.batchId,generatedAt:release.publishedAt,completeness:release.completeness,productStatus:release.productStatus,ruleVersion:release.ruleVersion,scope:{collection:'captured_intelligence_snapshot',filters:[]}};
  const etag='"'+release.releaseId+'"';if(req.headers['if-none-match']===etag){send(res,304,null,{ETag:etag});return true;}
  const data=route==='/api/snapshots/latest-version'?{...meta,productReason:release.productReason}:(await ledger.batch(release.batchId)).counts;
  send(res,200,{data,meta},{ETag:etag});
 }catch(e){if(e instanceof LedgerError)send(res,e.status,{code:e.code,message:e.message,request_id:randomUUID()});else throw e;}
 return true;
}
