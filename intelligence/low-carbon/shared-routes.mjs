import {sharedCapabilities} from './shared-mode.mjs';
import {currentRules,previewClassification} from '../classification-jobs.mjs';
import {compileRules} from '../industry-classification.mjs';
import {filterData,retrieve} from '../core.mjs';
import {constrainDocuments,expandedQuery} from '../query.mjs';
import {seriesEvidence} from '../series-evidence.mjs';
import {randomUUID} from 'node:crypto';
async function publishedBody(pool,visible){
 if(visible.manual)return visible;
 const row=(await pool.query(`SELECT document FROM (
  SELECT 0 priority,document FROM lc_shared.projections WHERE url=$1 AND document->>'versionId'=$2
  UNION ALL SELECT 1 priority,document FROM lc_shared.body_versions WHERE url=$1 AND version_id=$2
 ) versions ORDER BY priority LIMIT 1`,[visible.url,visible.versionId])).rows[0];
 return row?.document||visible;
}
export async function serveSharedLowCarbon(req,res,url,{store,scheduler,auditData,body,json}){
 const route=url.pathname,pool=store.pool;
 if(route==='/api/extract'&&req.method==='POST'){
  const input=await body(req),doc=store.data.documents.find(d=>d.id===input.id);if(!doc){json(res,404,{error:'资料不存在'});return true;}
  const saved=await publishedBody(pool,doc),extraction=saved.extraction;
  if(!extraction)return false; // Manual-only documents use the common local rule engine.
  const names=new Map(extraction.entities.map(e=>[e.id,e.nameZh||e.name]));
  json(res,200,{documentId:doc.id,title:doc.titleZh||doc.title,entities:extraction.entities.length,relations:extraction.relations.length,addedEntities:0,addedRelations:0,method:saved.localExtractionNotice?'复用本地规则线索':'复用共享提取结果',result:{entities:extraction.entities,relations:extraction.relations.map(r=>({...r,from:names.get(r.from)||r.from,to:names.get(r.to)||r.to,evidence:extraction.evidence.filter(e=>(r.evidenceIds||[]).includes(e.id)).map(e=>e.quote)}))}});return true;
 }
 if(route==='/api/ask'&&req.method==='POST'){
  const input=await body(req),question=String(input.question||'').trim();if(!question||question.length>1200){json(res,400,{error:'请输入1200字以内的问题'});return true;}
  const scope=filterData(store.data,input.filters||{}),expanded=expandedQuery(question);
  const terms=[...new Set((expanded.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]{2,}/g)||[]).flatMap(t=>/[\u4e00-\u9fff]/.test(t)?Array.from({length:t.length-1},(_,i)=>t.slice(i,i+2)):[t]))].slice(0,80);
  // The list snapshot is small. Search the full, locally saved body in SQL.
  const candidates=terms.length?(await pool.query(`WITH published AS (
   SELECT coalesce(CASE WHEN p.document->>'versionId'=s.version_id THEN p.document END,b.document) document
   FROM unnest($1::text[],$3::text[]) AS s(url,version_id)
   LEFT JOIN lc_shared.projections p ON p.url=s.url LEFT JOIN lc_shared.body_versions b ON b.url=s.url AND b.version_id=s.version_id
  ) SELECT document-'extraction'-'chunks'-'embedding'-'evidenceAssets' AS document FROM published
  WHERE EXISTS(SELECT 1 FROM unnest($2::text[]) term WHERE strpos(lower(concat_ws(' ',document->>'title',document->>'titleZh',document->>'content',document->>'contentZh')),term)>0)
  ORDER BY document->>'publishedAt' DESC NULLS LAST LIMIT 40`,[scope.documents.map(d=>d.url),terms,scope.documents.map(d=>d.versionId||null)])).rows.map(r=>r.document):[];
  const numeric=seriesEvidence(store.data,question,input.filters||{}),hits=retrieve(constrainDocuments([...candidates,...scope.documents.filter(d=>d.manual)],question),expanded,null).slice(0,Math.max(0,8-numeric.length));
  const references=[...numeric,...hits].map((d,i)=>{const {content,contentZh,chunks,embedding,extraction,...safe}=d;const passage=(contentZh||content||'').split(/\n|(?<=。)/).find(p=>terms.some(t=>p.toLowerCase().includes(t)))||(contentZh||content||'').slice(0,600);return {...safe,number:i+1,summaryZh:d.summaryZh||passage,evidence:[{quote:passage.slice(0,1200),method:'原文检索摘录'}]};});
  const answer=references.length?'以下为本地检索到的原文与已有摘要，不构成额外推断：\n\n'+references.map(r=>`[${r.number}] ${r.titleZh||r.title}\n${r.evidence?.[0]?.quote||r.summaryZh||''}`).join('\n\n'):'当前筛选范围没有足够的相关资料，请调整关键词或时间范围。';
  const record={id:'research_'+randomUUID(),question,answer,references,mode:'本地全文关键词检索与证据整理',generated:false,citationCheck:references.length>0,status:'本地整理',createdAt:new Date().toISOString(),filters:input.filters||{},model:null};await store.saveResearch(record);json(res,200,record);return true;
 }
 if(/^\/api\/document\/[^/]+$/.test(route)&&req.method==='GET'){
  const id=route.split('/').pop(),visible=store.data.documents.find(d=>d.id===id);if(!visible){json(res,404,{error:'资料不存在'});return true;}
  const version=url.searchParams.get('version');if(version&&!/^ver_[a-f0-9]{20}$/.test(version)){json(res,400,{error:'原文版本无效'});return true;}
  const saved=version?(await pool.query('SELECT document FROM lc_shared.body_versions WHERE url=$1 AND version_id=$2',[visible.url,version])).rows[0]?.document:await publishedBody(pool,visible);
  if(version&&!saved){json(res,404,{error:'该共享原文版本尚未保存'});return true;}
  const document=visible.manual?visible:{...visible,...saved,industry:visible.industry,topic:visible.topic};
  json(res,200,{...document,modelOperationsAvailable:false,evidence:store.data.evidence.filter(e=>e.documentId===id),events:store.data.events.filter(e=>e.documentId===id),relations:store.data.relations.filter(e=>e.documentId===id),observations:store.data.observations.filter(e=>e.documentId===id)});return true;
 }
 if(route==='/quant/api/iea-file'&&req.method==='GET'){const hash=url.searchParams.get('hash')||'';if(!/^[a-f0-9]{64}$/.test(hash)){json(res,404,{error:'文件不存在'});return true;}res.writeHead(302,{Location:'/ocean-intelligence/quant/api/iea-file?hash='+hash});res.end();return true;}
 if(route==='/api/system'||route==='/api/shared-services'){json(res,200,{appId:'low-carbon',database:'low_carbon_kb',collectionMode:'shared',aiPolicy:'reuse-only',modelCallsEnabled:false,capabilities:sharedCapabilities,collection:scheduler.status()});return true;}
 if(route==='/api/subscriptions'&&req.method==='GET'){
  const list=(await pool.query('SELECT id,payload,enabled,posts,articles,present,last_sync,status FROM mp2rss.subscriptions ORDER BY id')).rows,audit=await auditData();
  const counts=new Map(audit.subscriptions.map(s=>[s.id,s]));
  json(res,200,{list:list.map(s=>({...s,count:counts.get(s.id)?.count||0,ready:counts.get(s.id)?.ready||0})),jobs:[],configured:true,sharedRegistry:true,readOnly:true,state:scheduler.status(),classification:audit.mpCounts});return true;
 }
 if(route==='/api/rss/sources'&&req.method==='GET'){json(res,200,{list:store.data.sources.filter(s=>s.method==='rss').map(s=>({...s,id:'intel:'+s.id,alias:s.url,count:store.data.documents.filter(d=>d.sourceId===s.id).length})),sharedRegistry:true,readOnly:true});return true;}
 if(route==='/api/filters/reprocess'&&req.method==='POST'){
  if(scheduler.status().running){json(res,409,{error:'共享资料正在本地整理，请完成后再发布规则变更。'});return true;}
  const input=await body(req),config=await currentRules(pool),compiled=compileRules(config);
  const job=(await pool.query("INSERT INTO classification.jobs(version,config,scope,status,preview,result) VALUES($1,$2,$3,'queued','{}','{}') RETURNING *",[compiled.version,config,{...input,trigger:'shared-local-reprocess'}])).rows[0];
  // Force a publication for a manual request even if the source did not change.
  await pool.query("DELETE FROM lc_shared.state WHERE id='cursor'");await scheduler.run();json(res,202,job);return true;
 }
 if((route==='/api/rss/sync'||route==='/api/subscriptions/action')&&req.method==='POST'){
  const b=await body(req);if(route==='/api/rss/sync'||['sync','refresh'].includes(b.action)){await scheduler.run();json(res,202,{accepted:true,mode:'shared-local-refresh',message:'已请求更新共享资料视图，不启动采集或模型任务。'});}else json(res,403,{error:'来源在现有系统统一管理；低碳页只读取共享配置。'});return true;
 }
 if(route.startsWith('/api/rss/sources')&&req.method!=='GET'){json(res,403,{error:'请到现有系统的来源管理页维护共享配置。'});return true;}
 if(/^\/api\/document\/[^/]+\/(translation|vision)$/.test(route)||route.startsWith('/api/model-resources/')){
  const doc=store.data.documents.find(d=>d.id===route.split('/')[3]);
  if(route.endsWith('/translation')&&doc?.contentZh){const saved=await publishedBody(pool,doc);json(res,200,{status:'completed',result:{contentZh:saved.contentZh||doc.contentZh}});}
  else json(res,409,{code:'SHARED_RESULT_UNAVAILABLE',error:'低碳子系统只复用已有结果，不新增模型调用；可继续阅读原文或手工补充。'});return true;
 }
 if(route.startsWith('/api/processing-runs')){json(res,403,{error:'共享处理任务由现有系统统一执行，低碳子系统仅本地整理。'});return true;}
 return false;
}
