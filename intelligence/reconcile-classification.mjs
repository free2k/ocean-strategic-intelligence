import {attachPublishedRules} from './published-rules.mjs';
import {processSemanticQueue} from './semantic-classification.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import {id,chunks} from './core.mjs';
import {classifyRecord} from './industry-classification.mjs';
import {initClassification,applyClassificationJob,textBody,digest,decideArticle} from './classification-jobs.mjs';

// Runs only inside the intelligence scheduler's isolated snapshot and publication lock.
export function reconcileDocument(doc,decision){
 if(doc.manual)return false;
 const previous=doc.industry;
 doc.industry=decision;if(decision.primary)doc.topic=decision.primary;
 const changed=previous?.status!==decision.status||previous?.primary!==decision.primary;
 if(changed&&decision.status==='accepted'&&!doc.manual){
  doc.extractionRevision=digest([decision.version,decision.status,decision.primary]).slice(0,16);
  doc.autoExtraction={...doc.autoExtraction,status:'pending',nextRetryAt:null};
 }
 return changed;
}
export async function reconcileClassification(pool,data,semanticOptions={}){
 await initClassification(pool);await applyClassificationJob(pool);if(semanticOptions.limit>0||semanticOptions.client)await processSemanticQueue(pool,semanticOptions);
 const jobs=(await pool.query("SELECT * FROM classification.jobs WHERE status IN ('processing','partial','completed') ORDER BY id DESC")).rows;
 if(!jobs.length)throw Error('数据库尚无已生效分类规则，请先发布规则版本后生成快照');
 // A saved draft rule is not silently applied to the published intelligence snapshot.
 const targeted=jobs[0].scope.targeted===true,config=jobs[0].config,compiled=attachPublishedRules(data,jobs[0]);
 const rows=(await pool.query(`SELECT c.*,a.title,a.link,a.published_at,a.source_id,a.manual_classify,a.classify_method,a.filter_status,a.matched_topic,a.reject_reason,s.name source_name,s.type source_kind,CASE WHEN i.id IS NOT NULL THEN jsonb_build_object('hash',i.content_hash,'language',i.payload->>'language','source',i.payload->'source') END mp_payload,i.subscription_id,i.classification mp_classification FROM classification.articles c JOIN public.articles a ON a.id=c.article_id LEFT JOIN public.sources s ON s.id=a.source_id LEFT JOIN mp2rss.items i ON i.article_id=a.id WHERE ($1::bigint IS NULL OR c.job_id=$1 OR c.job_id IS NULL) ORDER BY a.id`,[targeted?jobs[0].id:null])).rows;
 const byUrl=new Map(data.documents.map(d=>[d.url,d]));const idsByJob=new Map();
 for(const a of rows){let doc=byUrl.get(a.link);const p=a.mp_payload,decision=a.manual_classify||a.classify_method==='manual'?decideArticle(a,compiled).decision:p?a.mp_classification:a.classification;
  if(!doc&&decision.status!=='accepted')continue;
  const body=(await pool.query("SELECT CASE WHEN i.id IS NOT NULL THEN i.payload->>'content' ELSE a.content END content FROM public.articles a LEFT JOIN mp2rss.items i ON i.article_id=a.id WHERE a.id=$1",[a.article_id])).rows[0];
  const content=textBody(body?.content);
  if(!doc&&decision.status==='accepted'&&content){
   const sourceId=p?'mp2rss_'+a.subscription_id:'article_source_'+a.source_id;
   if(!data.sources.some(s=>s.id===sourceId))data.sources.push({id:sourceId,name:a.source_name||'历史文章',url:p?.source?.platform==='x'?'https://x.com/':a.source_kind==='wechat'?'https://mp.weixin.qq.com/':a.link,method:'api',level:'S4',country:'GLOBAL',scope:p?'Mp2RSS 原文':'历史文章库补投递，保留原始出处',status:'ready'});
   const contentHash=p?.hash||digest([a.title,content]);doc={id:id('doc',a.link),versionId:id('ver',a.link+contentHash),contentHash,...(p?{providerHash:p.hash,provider:'Mp2RSS',originalContent:p.originalContent,cleaning:p.cleaning}:{}),articleId:a.article_id,sourceId,url:a.link,title:a.title,titleZh:a.title,content,chunks:chunks(content),language:p?.language||(/[\u4e00-\u9fff]/.test(content)?'zh':'en'),publishedAt:a.published_at?.toISOString(),collectedAt:new Date().toISOString(),extractionStatus:'candidate',extractionVersion:'rules-v1',extraction:{entities:[],events:[],relations:[],observations:[],evidence:[]}};
   data.documents.push(doc);byUrl.set(a.link,doc);
  }
  if(doc){if(!doc.manual){
   // Only our own article imports are refreshed here; independently collected originals remain intact.
   if(doc.articleId===a.article_id&&content&&doc.content!==content){doc.content=content;doc.contentHash=p?.hash||digest([a.title,content]);doc.versionId=id('ver',a.link+doc.contentHash);doc.chunks=chunks(content);doc.embedding=null;if(p)doc.providerHash=p.hash;}
   reconcileDocument(doc,decision);doc.classificationManaged=true;
  }const set=idsByJob.get(String(a.job_id))||new Set();set.add(doc.id);idsByJob.set(String(a.job_id),set);}
 }
 const owned=new Set(rows.map(a=>a.link)),extra=[];
 for(const doc of data.documents){if(!targeted&&!owned.has(doc.url)&&!doc.manual&&!doc.industry?.manual){if(reconcileDocument(doc,classifyRecord(doc,compiled)))extra.push(doc.id);}}
 // Only rows with explicit marine scope can become eligible; broad mineral totals stay candidates.
 for(const dataset of Object.values(targeted?{}:data.ieaDatasets?.datasets||{}))for(const row of dataset.records||[]){if(row.scopeEvidence&&/\boffshore\b|\bsubsea\b|\bseabed\b|Northern Lights/i.test(row.scopeEvidence))row.classification=classifyRecord({title:row.object,content:row.scopeEvidence},compiled);}
 // Reassign event topic without destroying independently reviewed facts.
 const docMap=new Map(data.documents.map(d=>[d.id,d]));for(const event of data.events){const doc=docMap.get(event.documentId);if((!targeted||owned.has(doc?.url))&&doc?.industry?.status==='accepted'&&!event.manual&&!event.reviewedAt)event.topic=doc.industry.primary;}
 const previousMarks=data.classificationJobs||[];
 data.classificationJobs=jobs.filter(j=>['processing','partial'].includes(j.status)).map(j=>({id:j.id,documentIds:[...new Set([...(idsByJob.get(String(j.id))||[]),...(previousMarks.find(m=>String(m.id)===String(j.id))?.documentIds||[]),...(j.id===jobs[0].id?extra:[])])],missingBody:j.result.missingBody||0}));
 data.generatedAt=new Date().toISOString();return data;
}
if(process.argv[1]?.endsWith('reconcile-classification.mjs')){
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});try{const dir=process.env.INTEL_DATA_DIR||'.data/intelligence',file=path.join(dir,'snapshot.json'),data=JSON.parse(await fs.readFile(file,'utf8'));await reconcileClassification(pool,data);
 const esc=s=>String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 for(const doc of data.documents.filter(d=>d.articleId&&d.content)){await fs.writeFile(path.join(dir,doc.versionId+'.html'),`<!doctype html><meta charset="utf-8"><h1>${esc(doc.title)}</h1><a href="${esc(doc.url)}">原文出处</a><pre>${esc(doc.content)}</pre>`);}
 await fs.writeFile(file+'.classification.tmp',JSON.stringify(data));await fs.rename(file+'.classification.tmp',file);}finally{await pool.end();}
}
