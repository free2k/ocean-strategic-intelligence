import {deliveryRevision,acknowledgeDelivery,markDelivery} from './intelligence-delivery.mjs';
import {acknowledgeClassification} from './classification-jobs.mjs';
import {mergeProcessedSnapshot,isComplete} from './auto-extract.mjs';
import {TaskJournal} from './research/task-journal.mjs';
import {ResearchPublication,publicationHash} from './research/publication.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';

export function nextCollectionTime(nextRun,now,completedFull=false){const planned=Date.parse(nextRun||'');return new Date(completedFull||!Number.isFinite(planned)?now+6*3600000:Math.max(now+30000,planned)).toISOString();}
export function workerTimeoutMs(name,value=process.env.INTEL_PIPELINE_TIMEOUT_HOURS){
 if(!['enrich.mjs','pipeline-worker.mjs'].includes(name))return 12*60000;
 const hours=Number(value||12);return (Number.isFinite(hours)&&hours>=1&&hours<=24?hours:12)*3600000;
}
export function workerStage(name){if(name==='reconcile-classification.mjs')return 'classifying';if(name==='pipeline-worker.mjs')return 'structuring';if(name==='import-mp2rss.mjs')return 'body_preparation';return 'collecting';}
export async function createScheduler({store,dir,root,serial,researchLedger=null,researchJournal=null,executeWorker=null}){
 const enabled=process.env.INTEL_SCHEDULE==='true',intervalMs=6*3600000,file=path.join(dir,'collection-status.json');
 let state={enabled,running:false,intervalHours:6,eiaExternal:process.env.INTEL_EIA_EXTERNAL==='true',lastRun:null,nextRun:null,steps:[]};
 try{const saved=JSON.parse(await fs.readFile(file,'utf8'));state={...state,...saved,enabled,running:false,...(saved.running?{result:'deferred',error:'上次任务中断，等待核对发布状态'}:{})};}catch(e){if(e.code!=='ENOENT')throw e;}
 const journal=researchLedger?(researchJournal||new TaskJournal(path.join(dir,'research-tasks'))):null;
 const publication=journal?new ResearchPublication({ledger:researchLedger,journal,store}):null;
 let timer;
 const persist=async()=>{const tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(state));await fs.rename(tmp,file);};
 const runScript=executeWorker||((name,stage)=>new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,[path.join(root,name)],{cwd:path.dirname(root),env:{...process.env,INTEL_DATA_DIR:stage,IEA_DATA_HOME:process.env.IEA_DATA_HOME||path.join(dir,'iea'),INTEL_MAX_PER_SOURCE:'4',INTEL_ENRICH_LIMIT:process.env.INTEL_ENRICH_BATCH_LIMIT||'6',INTEL_AUTO_EXTRACT_LIMIT:process.env.INTEL_EXTRACT_BATCH_LIMIT||'6'},stdio:['ignore','ignore','ignore']});
  const timeout=setTimeout(()=>p.kill(),name==='pipeline-worker.mjs'?Math.min(workerTimeoutMs(name),20*60000):workerTimeoutMs(name));
  p.on('error',()=>{clearTimeout(timeout);reject(new Error('worker_start_failed'));});p.on('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(new Error('worker_failed'));});
 }));
 const arm=(completedFull=false)=>{clearTimeout(timer);if(enabled){state.nextRun=nextCollectionTime(state.nextRun,Date.now(),completedFull);timer=setTimeout(()=>run(),Date.parse(state.nextRun)-Date.now());timer.unref();}};
 async function run({processOnly=false}={}){
  if(state.running)return false;
  // Claim before awaiting the process lock so concurrent requests cannot both enter.
  state.running=true;let guard,task,delivery,completedFull=false;
  try{
   if(process.platform==='linux'){
    guard=spawn('flock',['-n','/opt/ocean-intelligence/eia-daily.lock',process.execPath,'-e','process.stdout.write("locked\\n");process.stdin.resume();'],{stdio:['pipe','pipe','ignore']});
    const acquired=await new Promise(resolve=>{guard.stdout.once('data',()=>resolve(true));guard.once('exit',()=>resolve(false));guard.once('error',()=>resolve(false));});
    if(!acquired){state.result='deferred';state.error='其他数据维护任务正在运行，本轮延后';return false;}
   }
   if(publication&&state.taskId){const previous=await publication.recover(state.taskId);if(previous.status==='deferred'&&previous.checkpointHash){state.result='deferred';state.error='上一批资料发布待恢复：'+previous.reason;return false;}}
   if(publication){const latest=await researchLedger.latest();if(!latest){state.result='deferred';state.error='研究版本库尚无明确迁移基线，请先捕获基线';return false;}task=await journal.create({trigger:processOnly?'process_only':'scheduled_collection',expectedReleaseId:latest.releaseId});}
   delivery=await deliveryRevision(store.pool);
   state={...state,running:true,runMode:processOnly?'processing':'collection',result:null,taskId:task?.id||null,startedAt:new Date().toISOString(),steps:[],error:null};await persist();
   const stage=path.join(dir,'jobs',task?.id||randomUUID());await fs.mkdir(stage,{recursive:true});await fs.writeFile(path.join(stage,'snapshot.json'),JSON.stringify(store.data));
   const scripts=processOnly?['import-mp2rss.mjs','reconcile-classification.mjs','pipeline-worker.mjs']:['import-mp2rss.mjs','reconcile-classification.mjs','collect.mjs','official-sources.mjs','expanded-sources.mjs','open-datasets.mjs','iea-datasets.mjs','import-mp2rss.mjs','reconcile-classification.mjs',...(process.env.INTEL_EIA_EXTERNAL==='true'?[]:[process.env.EIA_API_KEY?'import-eia.mjs':'import-series.mjs']),'pipeline-worker.mjs'];
   for(const script of scripts){
    state.currentStep=script;if(task)task=await journal.update(task.id,task.revision,{status:workerStage(script),currentStep:script});await persist();
    const step={name:script,startedAt:new Date().toISOString()};let fatal=false;
    try{await runScript(script,stage);step.status='completed';}catch{step.status='failed';step.errorCode='WORKER_FAILED';fatal=script==='reconcile-classification.mjs';}
    step.finishedAt=new Date().toISOString();state.steps.push(step);if(task)task=await journal.update(task.id,task.revision,{steps:state.steps,errors:state.steps.filter(s=>s.status==='failed').map(s=>({stage:s.name,code:s.errorCode}))});await persist();if(fatal)throw Error('classification_reconciliation_failed');
    if(script==='reconcile-classification.mjs'&&step.status==='completed'&&!task){const ready=JSON.parse(await fs.readFile(path.join(stage,'snapshot.json'),'utf8'));await serial(async()=>{const merged=mergeProcessedSnapshot(store.data,ready);merged.generatedAt=new Date().toISOString();await store.import(merged);});state.lastMergedAt=new Date().toISOString();await persist();}
   }
   const candidate=JSON.parse(await fs.readFile(path.join(stage,'snapshot.json'),'utf8'));if(!Array.isArray(candidate.documents)||!candidate.documents.length)throw Error('invalid_snapshot');
   const partial=state.steps.some(s=>s.status==='failed')||candidate.sources?.some(s=>s.status==='failed')||candidate.errors?.some(e=>e.at&&e.at>=state.startedAt);
   state.currentStep='merging';await persist();
   // Place attachment artifacts before exposing a snapshot that references them.
   for(const f of await fs.readdir(stage))if(/\.(html|pdf|json|csv)$/.test(f)&&f!=='snapshot.json')await fs.copyFile(path.join(stage,f),path.join(dir,f));
   await serial(async()=>{
    const merged=mergeProcessedSnapshot(store.data,candidate);
    if(task){task=await publication.prepare(task,merged,{completeness:partial?'partial':'complete',errors:task.errors});merged.researchPublication={taskId:task.id,hash:task.checkpointHash};}
    await store.import(merged);
    if(task){if(publicationHash(store.data)!==task.checkpointHash)throw Error('source_snapshot_changed_during_commit');task=await publication.finish(task);}
    if(store.pool)await acknowledgeClassification(store.pool,store.data,isComplete);
   });
   const unfinished=store.data.documents.some(d=>!d.manual&&(!d.industry||d.industry.status==='accepted')&&!isComplete(d)&&(!d.autoExtraction?.nextRetryAt||d.autoExtraction.nextRetryAt<=new Date().toISOString()));
   if(unfinished&&store.pool)await markDelivery(store.pool);else await acknowledgeDelivery(store.pool,delivery);
   state.lastRun=new Date().toISOString();if(!processOnly)state.lastCollectionRun=state.lastRun;state.result=partial?'partial':'completed';state.documents=store.data.documents.length;completedFull=!processOnly;
   if(task){state.releaseId=task.releaseId;state.batchId=task.batchId;}
  }catch(e){
   state.error='本轮更新未完成，已入库资料保留';state.result='failed';
   if(task&&!['published','partial','failed'].includes(task.status)){try{task=await journal.update(task.id,task.revision,{status:task.checkpointHash?'deferred':'failed',reason:e.code||'PROCESSING_FAILED',currentStep:state.currentStep||null});if(task.status==='deferred'){state.result='deferred';state.error='资料发布尚未完成，将核对检查点后恢复';}}catch{state.error='任务记录更新失败，需核对持久状态';}}
  }finally{guard?.stdin.end();state.running=false;state.currentStep=null;arm(completedFull);await persist();}
  return true;
 }
 if(enabled){const target=state.nextRun?new Date(state.nextRun).getTime():Date.now()+intervalMs;state.nextRun=new Date(Math.max(Date.now()+30000,target)).toISOString();timer=setTimeout(()=>run(),Math.max(30000,target-Date.now()));timer.unref();}else state.nextRun=null;
 return {status:()=>state,run,journal,close:()=>clearTimeout(timer)};
}
