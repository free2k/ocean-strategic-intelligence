import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import pg from 'pg';
import {ProcessingRuns} from './processing-runs.mjs';
import {readAudit,readAuditBody,invalidateAudit} from './classification-audit.mjs';
import {currentRules,digest,textBody} from './classification-jobs.mjs';
import {compileRules} from './industry-classification.mjs';
import {queueSemantic} from './semantic-classification.mjs';
import {applyExtraction} from './auto-extract.mjs';
import {id,chunks} from './core.mjs';
import {attachPublishedRules} from './published-rules.mjs';
import {publishWorkspace} from './research/publish-workspace.mjs';
import {PostgresResearchRepository} from './research/repositories.mjs';
import {markDelivery} from './intelligence-delivery.mjs';

const busy=message=>Object.assign(Error(message),{status:409});
export async function acquireProcessingGuard(pool,lockFile='/opt/ocean-intelligence/eia-daily.lock'){
 const guard=spawn('flock',['-n',lockFile,process.execPath,'-e','process.stdout.write("locked\\n");process.stdin.resume()'],{stdio:['pipe','pipe','ignore']});
 let db;const keys=[];
 const release=async()=>{try{if(db){for(const key of keys)await db.query('SELECT pg_advisory_unlock($1)',[key]);db.release();}}finally{guard.stdin.end();}};
 try{
  const held=await new Promise(resolve=>{guard.stdout.once('data',()=>resolve(true));guard.once('exit',()=>resolve(false));guard.once('error',()=>resolve(false));});
  if(!held)throw busy('采集、分析或发布任务尚未退出，请稍后启动本轮处理');
  db=await pool.connect();
  for(const key of [73201910,73201912,73201914]){if(!(await db.query('SELECT pg_try_advisory_lock($1) AS held',[key])).rows[0].held)throw busy('采集、X 关联证据或 AI 复核任务正在执行，请等待当前小批次结束');keys.push(key);}
  if((await db.query("SELECT id FROM classification.jobs WHERE status IN ('queued','classifying','processing') LIMIT 1")).rows.length)throw busy('已有分类任务尚未结束，请先核对原任务');
  return release;
 }catch(e){await release();throw e;}
}

export async function createLiveProcessing({dir,store,serial,client,auditPool}){
 const pool=new pg.Pool({connectionString:process.env.INTEL_AUDIT_DATABASE_URL||process.env.INTEL_DATABASE_URL||process.env.DATABASE_URL,max:4,connectionTimeoutMillis:10000});
 const readInput=async()=>{
  const audit=await readAudit(pool),config=await currentRules(pool);
  const documents=audit.documents.filter(d=>!d.manual&&d.state==='pending').map(d=>({
   id:d.workingId||id('doc',d.url||d.id),auditId:d.id,auditArticleId:d.auditArticleId,auditMpId:d.auditMpId,auditEvidenceUrl:d.auditEvidenceUrl,workingId:d.workingId,
   url:d.url,title:d.title,titleZh:d.titleZh,sourceId:d.sourceId,sourceName:d.sourceName,publishedAt:d.publishedAt,classification:d.classification||{status:'unmatched'},manual:false
  })).sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||''))||a.id.localeCompare(b.id));
  return {config,documents,capturedAt:new Date().toISOString()};
 };
 const loadDocument=async d=>{const full=await readAuditBody(pool,d);const content=textBody(full.content);return {...full,content,inputBodyHash:digest(content),articleId:d.auditArticleId};};
 const publish=async({task,input,readResults})=>serial(async()=>{
  const results=await readResults(),fresh=await readAudit(pool),byId=new Map(fresh.documents.map(d=>[d.id,d]));
  const snapshot=structuredClone(store.data),compiled=compileRules(input.config);let skippedChanged=0;
  const db=await pool.connect();let job;
  try{
   await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='10s'");
   job=(await db.query("INSERT INTO classification.jobs(version,config,scope,status,preview,result,started_at,finished_at) VALUES($1,$2,$3,'completed',$4,$5,$6,now()) RETURNING *",[task.ruleVersion,input.config,{targeted:true,pendingOnly:true,trigger:'manual_processing',taskId:task.id},{total:task.total},{accepted:task.accepted,excluded:task.excluded,candidate:task.unmatched,pendingExtraction:task.retries.length},task.startedAt])).rows[0];
   for(const result of results){
    const d=result.document,decision=result.decision,current=byId.get(d.auditId);
    if(!current||current.manual){skippedChanged++;continue;}
    if(d.auditArticleId){const a=(await db.query('SELECT manual_classify,classify_method FROM public.articles WHERE id=$1 FOR UPDATE',[d.auditArticleId])).rows[0];if(!a||a.manual_classify||a.classify_method==='manual'){skippedChanged++;continue;}}
    const latest=await loadDocument({...current,id:d.id});if(latest.inputBodyHash!==d.inputBodyHash){skippedChanged++;continue;}
    if(d.auditArticleId){
     await db.query('INSERT INTO classification.audit(job_id,article_id,before_state,after_state) VALUES($1,$2,$3,$4)',[job.id,d.auditArticleId,current.classification,decision]);
     await db.query("UPDATE public.articles SET filter_status=$2,matched_topic=$3,classify_method=$4,reject_reason=$5,matched_keywords_json=$6,updated_at=now() WHERE id=$1",[d.auditArticleId,decision.status==='accepted'?'accepted':decision.status==='excluded'?'rejected':'pending',decision.primary,decision.method==='llm'?'llm':'keyword',decision.status==='excluded'?decision.reason.slice(0,255):null,JSON.stringify([...(decision.positive||[]).flatMap(p=>p.keywords||[]),...(decision.negative||[])])]);
     await db.query('INSERT INTO classification.articles(article_id,classification,input_hash,job_id) VALUES($1,$2,$3,$4) ON CONFLICT(article_id) DO UPDATE SET classification=EXCLUDED.classification,input_hash=EXCLUDED.input_hash,job_id=EXCLUDED.job_id,updated_at=now()',[d.auditArticleId,decision,digest([d.title,d.content]),job.id]);
     await db.query("UPDATE classification.semantic_queue SET status='stale',updated_at=now() WHERE article_id=$1",[d.auditArticleId]);
     if(result.retry&&decision.status==='unmatched'){await queueSemantic(db,{id:d.auditArticleId,title:d.title,content:d.content},compiled,decision,job.id);await db.query("UPDATE classification.semantic_queue SET status='failed',next_retry_at=now()+interval '10 minutes',error=$2 WHERE article_id=$1",[d.auditArticleId,result.retry.errorType]);}
    }
    if(d.auditMpId)await db.query('UPDATE mp2rss.items SET classification=$2,updated_at=now() WHERE id=$1',[d.auditMpId,decision]);
    if(d.auditEvidenceUrl)await db.query('UPDATE mp2rss.evidence_documents SET classification=$2,updated_at=now() WHERE url=$1',[d.auditEvidenceUrl,decision]);
    const old=snapshot.documents.find(x=>x.id===d.id||x.url===d.url);
    if(old?.manual||old?.industry?.manual)continue;
    if(decision.status!=='accepted'&&!old)continue;
    const doc={...old,...d,industry:decision,topic:decision.primary||old?.topic,classificationManaged:true,chunks:chunks(d.content),collectedAt:old?.collectedAt||new Date().toISOString()};
    delete doc.classification;delete doc.inputBodyHash;
    snapshot.documents=snapshot.documents.filter(x=>x.id!==doc.id);snapshot.documents.push(doc);
    if(!snapshot.sources.some(s=>s.id===d.sourceId))snapshot.sources.push({id:d.sourceId,name:d.sourceName,url:d.url,level:'S4',method:'api',status:'ready'});
    if(result.extraction)applyExtraction(snapshot,doc,result.extraction,new Date().toISOString());
    else if(decision.status==='accepted')doc.autoExtraction={status:'failed',versionId:doc.versionId,errorType:result.retry?.errorType||'empty_content',nextRetryAt:new Date(Date.now()+600000).toISOString()};
   }
   await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  attachPublishedRules(snapshot,job);snapshot.generatedAt=new Date().toISOString();
  // Persist the candidate before committing so a publication failure is recoverable.
  await fs.writeFile(path.join(dir,'processing-runs',task.id,'merge-candidate.json'),JSON.stringify(snapshot));
  await store.import(snapshot);
  const release=await publishWorkspace(new PostgresResearchRepository(pool),store.data,{trigger:'manual_processing',completeness:task.retries.length?'partial':'complete'});
  await pool.query("UPDATE classification.jobs SET status=$2,result=result || $3::jsonb WHERE id=$1",[job.id,task.retries.length?'partial':'completed',JSON.stringify({published:true,releaseId:release.releaseId,skippedChanged})]);
  if(task.retries.length)await markDelivery(pool);
  invalidateAudit(pool);invalidateAudit(auditPool);
  return {mode:'live',releaseId:release.releaseId,publishedAt:new Date().toISOString(),skippedChanged,classificationJobId:job.id};
 });
 const manager=new ProcessingRuns({dir:path.join(dir,'processing-runs'),readInput,client,model:process.env.CHAT_MODEL||'qwen-plus',mode:'live',acquire:()=>acquireProcessingGuard(pool),loadDocument,publish});
 await manager.recover();return manager;
}
