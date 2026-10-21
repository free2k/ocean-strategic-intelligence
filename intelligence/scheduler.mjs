import {acknowledgeCheckpoints} from './article-checkpoints.mjs';
import {mergeSnapshotFile} from './merge-snapshot-stream.mjs';
import {createTaskWorkspace,taskEntries,finishTaskWorkspace} from './task-workspace.mjs';
import {assertJobCapacity,retryDelay,finishJobStage} from './job-storage.mjs';
import {deliveryRevision,acknowledgeDelivery,markDelivery} from './intelligence-delivery.mjs';
import {acknowledgeClassification} from './classification-jobs.mjs';
import {isComplete} from './auto-extract.mjs';
import {TaskJournal} from './research/task-journal.mjs';
import {ResearchPublication,publicationHash} from './research/publication.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';

export function nextCollectionTime(nextRun,now,completedFull=false){const planned=Date.parse(nextRun||'');return new Date(completedFull||!Number.isFinite(planned)?now+12*3600000:Math.max(now+30000,planned)).toISOString();}
export function workerTimeoutMs(name,value=process.env.INTEL_PIPELINE_TIMEOUT_HOURS){
 if(!['enrich.mjs','pipeline-worker.mjs'].includes(name))return 12*60000;
 const hours=Number(value||12);return (Number.isFinite(hours)&&hours>=1&&hours<=24?hours:12)*3600000;
}
export function workerStage(name){if(name==='reconcile-classification.mjs')return 'classifying';if(name==='pipeline-worker.mjs')return 'structuring';if(name==='import-mp2rss.mjs')return 'body_preparation';return 'collecting';}
export async function createScheduler({store,dir,root,serial,researchLedger=null,researchJournal=null,executeWorker=null,checkCapacity=assertJobCapacity}){
 const enabled=process.env.INTEL_SCHEDULE==='true',intervalMs=12*3600000,file=path.join(dir,'collection-status.json');
 let interrupted=false;
 let state={enabled,running:false,intervalHours:12,eiaExternal:process.env.INTEL_EIA_EXTERNAL==='true',lastRun:null,nextRun:null,steps:[]};
 try{const saved=JSON.parse(await fs.readFile(file,'utf8'));interrupted=!!saved.running;state={...state,...saved,enabled,running:false,...(saved.running?{result:'deferred',error:'上次任务中断，等待核对发布状态'}:{})};}catch(e){if(e.code!=='ENOENT')throw e;}
 if(state.intervalHours!==12){state.nextRun=nextCollectionTime(null,Date.parse(state.lastCollectionRun||'')||Date.now(),true);state.intervalHours=12;}
 if(interrupted){state.failureCount=(state.failureCount||0)+1;state.errorCode='INTERRUPTED_RUN';state.retryAt=new Date(Date.now()+retryDelay(state.failureCount,state.errorCode)).toISOString();}
 const journal=researchLedger?(researchJournal||new TaskJournal(path.join(dir,'research-tasks'))):null;
 const publication=journal?new ResearchPublication({ledger:researchLedger,journal,store}):null;
 let timer;
 const persist=async()=>{const tmp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(tmp,JSON.stringify(state));await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}};
 if(interrupted)await persist();
 const runScript=executeWorker||((name,stage)=>new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,[path.join(root,name)],{cwd:path.dirname(root),env:{...process.env,INTEL_DATA_DIR:stage,INTEL_CHECKPOINT_DIR:path.join(dir,'article-checkpoints'),IEA_DATA_HOME:process.env.IEA_DATA_HOME||path.join(dir,'iea'),INTEL_MAX_PER_SOURCE:'4',INTEL_ENRICH_LIMIT:process.env.INTEL_ENRICH_BATCH_LIMIT||'6',INTEL_AUTO_EXTRACT_LIMIT:process.env.INTEL_EXTRACT_BATCH_LIMIT||'6'},stdio:['ignore','ignore','ignore']});
  const timeout=setTimeout(()=>p.kill(),name==='pipeline-worker.mjs'?Math.min(workerTimeoutMs(name),20*60000):workerTimeoutMs(name));
  p.on('error',()=>{clearTimeout(timeout);reject(new Error('worker_start_failed'));});p.on('exit',(code,signal)=>{clearTimeout(timeout);code===0?resolve():reject(Object.assign(new Error('worker_failed'),{code:signal?'WORKER_SIGNAL_'+signal:'WORKER_EXIT_'+code}));});
 }));
 const arm=(completedFull=false)=>{clearTimeout(timer);if(enabled){state.nextRun=new Date(Math.max(Date.parse(nextCollectionTime(state.nextRun,Date.now(),completedFull)),Date.parse(state.retryAt||'')||0)).toISOString();timer=setTimeout(()=>run(),Date.parse(state.nextRun)-Date.now());timer.unref();}};
 async function run({processOnly=false}={}){
  if(state.running||Date.parse(state.retryAt||'')>Date.now())return false;
  // Claim before awaiting the process lock so concurrent requests cannot both enter.
  state.running=true;let guard,task,delivery,stage,committed=false,copied=[],completedFull=false;
  try{
   if(process.platform==='linux'){
    guard=spawn('flock',['-n','/opt/ocean-intelligence/eia-daily.lock',process.execPath,'-e','process.stdout.write("locked\\n");process.stdin.resume();'],{stdio:['pipe','pipe','ignore']});
    const acquired=await new Promise(resolve=>{guard.stdout.once('data',()=>resolve(true));guard.once('exit',()=>resolve(false));guard.once('error',()=>resolve(false));});
    if(!acquired){state.result='deferred';state.error='其他数据维护任务正在运行，本轮延后';return false;}
   }
   await checkCapacity(dir);await store.refresh?.();
   if(publication&&state.taskId){const previous=await publication.recover(state.taskId);if(previous.status==='deferred'&&previous.checkpointHash){state.result='deferred';state.error='上一批资料发布待恢复：'+previous.reason;return false;}}
   if(publication){const latest=await researchLedger.latest();if(!latest){state.result='deferred';state.error='研究版本库尚无明确迁移基线，请先捕获基线';return false;}task=await journal.create({trigger:processOnly?'process_only':'scheduled_collection',expectedReleaseId:latest.releaseId});}
   delivery=await deliveryRevision(store.pool);
   state={...state,running:true,runMode:processOnly?'processing':'collection',result:null,taskId:task?.id||null,startedAt:new Date().toISOString(),steps:[],error:null,errorCode:null,errorDetail:null};await persist();
   stage=path.join(dir,'jobs',task?.id||randomUUID());await fs.mkdir(stage,{recursive:true});await createTaskWorkspace(store.pool,store.data,stage);
   const scripts=processOnly?['import-mp2rss.mjs','reconcile-classification.mjs','pipeline-worker.mjs']:['import-mp2rss.mjs','reconcile-classification.mjs','collect.mjs','official-sources.mjs','expanded-sources.mjs','open-datasets.mjs','iea-datasets.mjs','import-mp2rss.mjs','reconcile-classification.mjs',...(process.env.INTEL_EIA_EXTERNAL==='true'?[]:[process.env.EIA_API_KEY?'import-eia.mjs':'import-series.mjs']),'pipeline-worker.mjs'];
   for(const script of scripts){
    store.suspend?.();
    state.currentStep=script;if(task)task=await journal.update(task.id,task.revision,{status:workerStage(script),currentStep:script});await persist();
    const step={name:script,startedAt:new Date().toISOString()};let fatal=false;
    try{await runScript(script,stage);step.status='completed';}catch(error){step.status='failed';step.errorCode=error.code||'WORKER_FAILED';fatal=script==='reconcile-classification.mjs';}
    step.finishedAt=new Date().toISOString();state.steps.push(step);if(task)task=await journal.update(task.id,task.revision,{steps:state.steps,errors:state.steps.filter(s=>s.status==='failed').map(s=>({stage:s.name,code:s.errorCode}))});await persist();if(fatal)throw Error('classification_reconciliation_failed');
    if(script==='reconcile-classification.mjs'&&step.status==='completed'&&!task){for(const f of await fs.readdir(stage))if(/\.(html|pdf|json|csv)$/.test(f)&&!['snapshot.json','task-input.json'].includes(f)){await fs.copyFile(path.join(stage,f),path.join(dir,f));if(!copied.includes(f))copied.push(f);}await store.resume?.();await serial(async()=>{const merged=await mergeSnapshotFile(store.data,taskEntries(stage));merged.generatedAt=new Date().toISOString();await store.import(merged,{mirror:false});});state.lastMergedAt=new Date().toISOString();await persist();}
   }
   await store.resume?.();const candidate=await mergeSnapshotFile(store.data,taskEntries(stage));if(!Array.isArray(candidate.documents)||!candidate.documents.length)throw Error('invalid_snapshot');
   const partial=state.steps.some(s=>s.status==='failed')||candidate.sources?.some(s=>s.status==='failed')||candidate.errors?.some(e=>e.at&&e.at>=state.startedAt);
   state.currentStep='merging';await persist();
   // Place attachment artifacts before exposing a snapshot that references them.
   for(const f of await fs.readdir(stage))if(/\.(html|pdf|json|csv)$/.test(f)&&!['snapshot.json','task-input.json'].includes(f)){await fs.copyFile(path.join(stage,f),path.join(dir,f));copied.push(f);}
   await serial(async()=>{
    const merged=candidate;
    if(task){task=await publication.prepare(task,merged,{completeness:partial?'partial':'complete',errors:task.errors});merged.researchPublication={taskId:task.id,hash:task.checkpointHash};}
    await store.import(merged);
    if(task){if(publicationHash(store.data)!==task.checkpointHash)throw Error('source_snapshot_changed_during_commit');task=await publication.finish(task);}
    if(store.pool)await acknowledgeClassification(store.pool,store.data,isComplete);
   });
   committed=true;await acknowledgeCheckpoints(dir,store.data).catch(error=>console.error('checkpoint cleanup:',error.code||error.name));
   const unfinished=store.data.documents.some(d=>!d.manual&&(!d.industry||d.industry.status==='accepted')&&!isComplete(d)&&(!d.autoExtraction?.nextRetryAt||d.autoExtraction.nextRetryAt<=new Date().toISOString()));
   if(unfinished&&store.pool)await markDelivery(store.pool);else await acknowledgeDelivery(store.pool,delivery);
   state.lastRun=new Date().toISOString();if(!processOnly)state.lastCollectionRun=state.lastRun;state.result=partial?'partial':'completed';state.documents=store.data.documents.length;completedFull=!processOnly;
   state.failureCount=0;state.retryAt=null;state.errorCode=null;state.errorDetail=null;
   if(state.steps.some(s=>s.status==='failed')){state.retryAt=new Date(Date.now()+retryDelay(1,'WORKER_FAILED')).toISOString();}
   if(task){state.releaseId=task.releaseId;state.batchId=task.batchId;}
  }catch(e){
   state.failureCount=(state.failureCount||0)+1;state.errorCode=e.code||'PROCESSING_FAILED';state.errorDetail=String(e.message||e).slice(0,1000);state.retryAt=new Date(Date.now()+retryDelay(state.failureCount,state.errorCode)).toISOString();
   console.error('collection failed',JSON.stringify({code:state.errorCode,message:state.errorDetail,retryAt:state.retryAt,stage:state.currentStep}));
   state.error='本轮更新未完成，已入库资料保留';state.result='failed';
   if(task&&!['published','partial','failed'].includes(task.status)){try{task=await journal.update(task.id,task.revision,{status:task.checkpointHash?'deferred':'failed',reason:e.code||'PROCESSING_FAILED',currentStep:state.currentStep||null});if(task.status==='deferred'){state.result='deferred';state.error='资料发布尚未完成，将核对检查点后恢复';}}catch{state.error='任务记录更新失败，需核对持久状态';}}
  }finally{if(stage){try{await finishTaskWorkspace(store.pool,stage,{committed});await finishJobStage(dir,stage,{committed,copied});}catch(e){state.cleanupError=e.code||e.message;console.error('job cleanup:',state.cleanupError);}}guard?.stdin.end();store.suspend?.();state.running=false;state.currentStep=null;arm(completedFull);await persist().catch(e=>console.error('collection status persistence:',e.code||e.message));}
  return true;
 }
 if(enabled){const target=Math.max(state.nextRun?new Date(state.nextRun).getTime():Date.now()+intervalMs,Date.parse(state.retryAt||'')||0);state.nextRun=new Date(Math.max(Date.now()+30000,target)).toISOString();timer=setTimeout(()=>run(),Math.max(30000,target-Date.now()));timer.unref();}else state.nextRun=null;
 return {status:()=>state,run,journal,close:()=>clearTimeout(timer)};
}
