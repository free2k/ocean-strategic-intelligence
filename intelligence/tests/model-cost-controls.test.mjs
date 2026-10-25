import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ModelRequestStore} from '../model-request-store.mjs';
import {taskClient,requestHash} from '../model-client.mjs';
import {retryPlan,safeModelError} from '../model-retry.mjs';
import {taskModel,translationMode} from '../model-policy.mjs';
import {drainBatches} from '../model-batch-worker.mjs';
import {translateEvidence,recordEvidenceFailure} from '../../server/integrations/x-evidence-store.mjs';
import {translationResource,visionResource,documentOverlay,runResources} from '../model-resources.mjs';
import {serveModelResource} from '../model-resource-routes.mjs';
import {selectPending,enrich} from '../enrich.mjs';
import {Store} from '../store.mjs';

const baseURL='https://provider.invalid/compatible-mode/v1';
const request={model:'qwen3.7-flash',temperature:0,response_format:{type:'json_object'},messages:[{role:'user',content:'A wind project adds 20 MW.'}]};
const response=(content={summaryZh:'海上项目新增20 MW。'})=>({model:'qwen3.7-flash',choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}],usage:{prompt_tokens:20,completion_tokens:10}});
async function fixture(fn){
 const db=new PGlite();
 const query=async(sql,args)=>{if(!args&&sql.includes(';')){await db.exec(sql);return {rows:[]};}return db.query(sql,args);};
 const pool={query,connect:async()=>({query,release(){}})};const store=new ModelRequestStore(pool);
 try{await store.init();await db.exec(`CREATE SCHEMA mp2rss;CREATE TABLE mp2rss.state(id text PRIMARY KEY,payload jsonb);CREATE TABLE mp2rss.evidence_documents(url text PRIMARY KEY,payload jsonb,updated_at timestamptz DEFAULT now());CREATE TABLE mp2rss.evidence_links(url text PRIMARY KEY,payload jsonb,status text,next_check timestamptz,updated_at timestamptz DEFAULT now());`);await fn({db,pool,store});}finally{await db.close();}
}

test('routing changes routine text tasks while quality tasks and existing translations stay available',()=>{
 const env={CHAT_MODEL:'qwen-plus'};assert.equal(taskModel('classification',{env}),'qwen3.7-flash');assert.equal(taskModel('summary',{env}),'qwen3.7-flash');assert.equal(taskModel('extraction',{env}),'qwen-plus');assert.equal(taskModel('answer',{env}),'qwen-plus');
 assert.equal(taskModel('translation',{env:{INTEL_MODEL_TRANSLATION:'validated-model'}}),'validated-model');
 const pdf={language:'en',url:'https://example.org/report.pdf',content:'original'};
 assert.equal(translationMode(pdf),'summary');assert.equal(translationMode(pdf,{manual:true}),'full');assert.equal(translationMode({...pdf,contentZh:'已有全文'}),'full');
});
test('transient failures are bounded, permanent quota errors pause, and waiting does not consume retries',()=>{
 assert.equal(retryPlan({status:500},{attempts:2}).status,'paused');assert.equal(retryPlan({status:403},{attempts:0}).status,'paused');
 assert.equal(retryPlan({code:'AllocationQuota.FreeTierOnly'}).status,'paused');
 for(const code of ['BATCH_DEFERRED','MODEL_BATCH_PENDING']){const p=retryPlan({code},{attempts:2,now:0});assert.equal(p.attempts,2);assert.ok(Date.parse(p.nextRetryAt)>0);}
 assert.ok(!JSON.stringify(safeModelError({status:403,message:'private credential'})).includes('private'));
});
test('persistent realtime cache deduplicates concurrent work and survives a new client instance',async()=>fixture(async({store,db})=>{
 let calls=0;const raw={baseURL,chat:{completions:{create:async()=>{calls++;return response();}}}};
 const a=taskClient(raw,{task:'summary',store});const results=await Promise.allSettled([a.chat.completions.create(request),a.chat.completions.create(request)]);
 assert.ok(results.some(x=>x.status==='fulfilled'));assert.equal(calls,1);
 const b=taskClient(raw,{task:'summary',store});await b.chat.completions.create({...request,messages:structuredClone(request.messages)});assert.equal(calls,1);
 await b.chat.completions.create({...request,messages:[{role:'user',content:'New content'}]});assert.equal(calls,2);
 assert.equal((await db.query("SELECT count(*)::int n FROM model_ops.requests WHERE status='completed'")).rows[0].n,2);
}));
test('authorization failure and uncertain timeout are never silently retried',async()=>fixture(async({store})=>{
 for(const error of [{status:403},Object.assign(Error('not logged'),{name:'APIConnectionTimeoutError'})]){
  let calls=0;const raw={baseURL,chat:{completions:{create:async()=>{calls++;throw error;}}}};
  const ai=taskClient(raw,{task:'summary',store});const body={...request,messages:[{role:'user',content:'case '+error.status}]};
  await assert.rejects(()=>ai.chat.completions.create(body));await assert.rejects(()=>ai.chat.completions.create(body));assert.equal(calls,1);
 }
}));
test('stale realtime ownership becomes uncertain and is never claimed as a fresh paid request',async()=>fixture(async({store,db})=>{
 let calls=0;const raw={baseURL,chat:{completions:{create:async()=>{calls++;return response();}}}};const ai=taskClient(raw,{task:'summary',store});
 await ai.chat.completions.create(request);const row=(await db.query('SELECT id FROM model_ops.requests')).rows[0];
 await db.query("UPDATE model_ops.requests SET status='running',response=NULL,body=$2,updated_at=now()-interval '20 minutes' WHERE id=$1",[row.id,request]);
 await assert.rejects(()=>ai.chat.completions.create(request),{code:'MODEL_REQUEST_UNCERTAIN'});assert.equal(calls,1);
 await assert.rejects(()=>store.resumeRequest(row.id),{code:'ONLY_PAUSED_REQUEST_CAN_RESUME'});
}));
test('an operator can resume a definite rejected request, while receipt ambiguity remains protected',async()=>fixture(async({store})=>{
 let good=false,calls=0;const raw={baseURL,chat:{completions:{create:async()=>{calls++;if(!good)throw {status:403};return response();}}}};const ai=taskClient(raw,{task:'summary',store});
 let id;try{await ai.chat.completions.create(request);}catch(e){id=e.receiptId;}assert.match(id,/^[a-f0-9]{64}$/);
 good=true;await store.resumeRequest(id);await ai.chat.completions.create(request);assert.equal(calls,2);
}));
test('embeddings retain their configured model and dimensions and reuse saved vectors',async()=>fixture(async({store})=>{
 let calls=0;const raw={baseURL,embeddings:{create:async r=>{calls++;assert.equal(r.model,'text-embedding-v4');assert.equal(r.dimensions,1024);return {data:[{embedding:[.1,.2]}]};}}};
 const ai=taskClient(raw,{task:'embedding',store});const body={model:'text-embedding-v4',input:'wind',dimensions:1024};await ai.embeddings.create(body);await ai.embeddings.create(body);assert.equal(calls,1);
}));
test('batch queues once, submits homogeneous JSONL, polls, and returns the saved result without realtime fallback',async()=>fixture(async({store,db})=>{
 let realtime=0,submissions=0,lines=[];const raw={baseURL,chat:{completions:{create:async()=>{realtime++;return response();}}}};
 const ai=taskClient(raw,{task:'classification',automatic:true,store,env:{INTEL_BATCH_ENABLED:'true',OPENAI_BATCH_BASE_URL:baseURL}});
 for(let i=0;i<2;i++)await assert.rejects(()=>ai.chat.completions.create(request),{code:'MODEL_BATCH_PENDING'});
 const provider={baseURL,files:{create:async({file,purpose})=>{assert.equal(purpose,'batch');lines=(await file.text()).trim().split('\n').map(JSON.parse);return {id:'file-1'};},content:async()=>({text:async()=>lines.map(l=>JSON.stringify({custom_id:l.custom_id,response:{status_code:200,body:response()}})).join('\n')})},batches:{create:async input=>{submissions++;assert.equal(input.endpoint,'/v1/chat/completions');assert.equal(input.completion_window,'24h');return {id:'provider-batch-1'};},retrieve:async()=>({status:'completed',output_file_id:'out-1'})}};
 assert.equal((await drainBatches(store,provider)).submitted,1);assert.equal(lines.length,1);assert.equal(lines[0].body.model,'qwen3.7-flash');
 assert.equal((await drainBatches(store,provider)).completed,1);assert.equal((await ai.chat.completions.create(request)).usage.prompt_tokens,20);assert.equal(submissions,1);assert.equal(realtime,0);
 assert.equal((await db.query("SELECT count(*)::int n FROM model_ops.requests WHERE status='completed'")).rows[0].n,1);
}));
test('unknown submission and missing batch output pause reconciliation instead of creating another charge',async()=>fixture(async({store,db})=>{
 const body={...request,messages:[{role:'user',content:'unknown submit'}]};const id=requestHash(body);
 await store.claim({id,task:'summary',model:body.model,endpoint:'/v1/chat/completions',body,batch:true,origin:baseURL});
 await db.query("INSERT INTO model_ops.batches(id,status,endpoint,model) VALUES('crash','submitting','/v1/chat/completions',$1)",[body.model]);await db.query("UPDATE model_ops.requests SET status='submitting',batch_id='crash' WHERE id=$1",[id]);
 let calls=0;const client={baseURL,batches:{create:async()=>{calls++;}}};await drainBatches(store,client);assert.equal((await store.get(id)).status,'uncertain');assert.equal(calls,0);
 await db.query("INSERT INTO model_ops.batches(id,status,endpoint,model,provider_id,origin) VALUES('partial','submitted','/v1/chat/completions',$1,'p-1',$2)",[body.model,baseURL]);await db.query("UPDATE model_ops.requests SET status='submitted',batch_id='partial' WHERE id=$1",[id]);
 client.batches.retrieve=async()=>({status:'completed',output_file_id:'empty'});client.files={content:async()=>({text:async()=>''})};await drainBatches(store,client);assert.equal((await store.get(id)).status,'uncertain');assert.equal(calls,0);
}));
test('batch never submits queued work to a different workspace endpoint',async()=>fixture(async({store})=>{
 await store.claim({id:'different-origin',task:'summary',model:'qwen3.7-flash',endpoint:'/v1/chat/completions',body:request,batch:true,origin:'https://other.invalid/v1'});
 const r=await drainBatches(store,{baseURL});assert.equal(r.submitted,0);assert.equal((await store.get('different-origin')).status,'queued');
}));
test('a completed batch with unusable output is preserved without a second paid submission',async()=>fixture(async({store,db})=>{
 const id=requestHash(['invalid-output']);await store.claim({id,task:'summary',model:request.model,endpoint:'/v1/chat/completions',body:request,batch:true,origin:baseURL});
 await db.query("INSERT INTO model_ops.batches(id,provider_id,status,endpoint,model,origin) VALUES('invalid-batch','p-invalid','submitted','/v1/chat/completions',$1,$2)",[request.model,baseURL]);
 await db.query("UPDATE model_ops.requests SET status='submitted',attempts=1,batch_id='invalid-batch' WHERE id=$1",[id]);
 let submissions=0;const provider={baseURL,batches:{retrieve:async()=>({status:'completed',output_file_id:'bad-output'}),create:async()=>{submissions++;}},files:{content:async()=>({text:async()=>JSON.stringify({custom_id:id,response:{status_code:200,body:{choices:[{finish_reason:'length',message:{content:'truncated'}}]}}})})}};
 assert.equal((await drainBatches(store,provider)).uncertain,1);await drainBatches(store,provider);assert.equal((await store.get(id)).status,'uncertain');assert.equal(submissions,0);
}));
test('evidence deadline always persists a future retry and permanent errors remove an item from due work',async()=>fixture(async({store,db})=>{
 const j={url:'https://example.org/report',payload:{}};await db.query("INSERT INTO mp2rss.evidence_links(url,payload,status,next_check) VALUES($1,'{}','retry',now())",[j.url]);
 await recordEvidenceFailure(store.pool,j,{code:'BATCH_DEFERRED'},'model');let row=(await db.query('SELECT status,next_check>now() delayed FROM mp2rss.evidence_links WHERE url=$1',[j.url])).rows[0];assert.equal(row.delayed,true);
 await recordEvidenceFailure(store.pool,j,{status:403},'model');row=(await db.query('SELECT status,next_check::text next FROM mp2rss.evidence_links WHERE url=$1',[j.url])).rows[0];assert.equal(row.status,'paused');assert.equal(row.next,'infinity');
}));
test('automatic PDF summarization preserves original content and does not masquerade as full translation',async()=>fixture(async({store})=>{
 let calls=0;const original='Offshore wind original content. '.repeat(1000);const p={url:'https://example.org/report.pdf',contentKind:'pdf',language:'en',content:original};
 const ai={chat:{completions:{create:async r=>{calls++;assert.equal(r.max_tokens,700);return response({titleZh:'报告',summaryZh:'所给开头讨论海上风电；仅覆盖摘录。'});}}}};
 await translateEvidence(p,ai,store.pool);assert.equal(calls,1);assert.equal(p.content,original);assert.equal(p.contentZh,undefined);assert.equal(p.translationMode,'on_demand');
 await translateEvidence({...p},ai,store.pool);assert.equal(calls,1);
}));
test('summary-complete and paused items cannot starve later enrichment work',()=>{
 const content='Source';const h=createHash('sha256').update(content).digest('hex');
 const done=Array.from({length:20},(_,i)=>({id:i,language:'en',versionId:'v',url:'https://example.org/a.pdf',content,summarySourceHash:h,embedding:[1]}));
 const paused={id:'paused',language:'en',versionId:'v',content:'x',embedding:[1],translationError:{sourceVersion:'v',status:'paused'}};
 assert.deepEqual(selectPending([...done,paused,{id:'next',language:'en',versionId:'v',content:'next'}],1).map(d=>d.id),['next']);
});
test('on-demand routes queue idempotently; reading overlays never invokes a model',async()=>fixture(async({store})=>{
 const doc={id:'doc-1',url:'https://example.org/a.pdf',language:'en',content:'Original source',evidenceAssets:[]};let status,payload;
 const context={documents:[doc],store,body:async()=>({}),json:(_,s,v)=>{status=s;payload=v;}};
 await serveModelResource({method:'POST'},{},new URL('http://local/api/document/doc-1/translation'),context);assert.equal(status,202);const id=payload.id;
 await serveModelResource({method:'POST'},{},new URL('http://local/api/document/doc-1/translation'),context);assert.equal(payload.id,id);
 await documentOverlay(store,doc);assert.equal((await store.resource(id)).status,'queued');
 assert.equal(await serveModelResource({method:'GET'},{},new URL('http://local/api/document/doc-1'),context),false);
}));
test('manual full translation completes from durable chunks and appears after reopening a document',async()=>fixture(async({store})=>{
 const doc={id:'doc-2',url:'https://example.org/b.pdf',title:'Report',language:'en',content:'a'.repeat(7000),evidenceAssets:[]};const job=translationResource(doc);await store.queueResource(job);let calls=0;
 const raw={baseURL,chat:{completions:{create:async()=>{calls++;return response({titleZh:'报告',contentZh:'完整中文片段'});}}}};
 assert.ok((await runResources(store,raw)).completed);assert.equal(calls,2);
 const reopened=await documentOverlay(store,doc);assert.equal(reopened.content,doc.content);assert.equal(reopened.contentZh,'完整中文片段\n\n完整中文片段');
 assert.equal((await runResources(store,raw)).idle,true);assert.equal(calls,2);
}));
test('requested image recognition verifies the snapshot and never infers numeric values from a chart curve',async()=>fixture(async({store,db})=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'model-image-'));
 try{const bytes=Buffer.from([0x89,0x50,0x4e,0x47,1,2,3]);const sha256=createHash('sha256').update(bytes).digest('hex');const asset={url:'https://example.org/chart.png',snapshot:'abcd.bin',sha256};await fs.writeFile(path.join(dir,asset.snapshot),bytes);const job=visionResource(asset);await store.queueResource(job);
 const raw={baseURL,chat:{completions:{create:async()=>response({kind:'chart',summaryZh:'曲线图',values:[{value:999}]})}}};await runResources(store,raw,{evidenceDir:dir});assert.deepEqual((await store.resource(job.id)).result.values,[]);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}));
test('a code-only restart loads published rules without rewriting existing workspace rows or files',async()=>fixture(async({pool,db})=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'model-preserve-startup-'));
 const old=process.env.INTEL_PRESERVE_STARTUP_DATA;
 try{
  const data={sources:[],documents:[],entities:[],events:[],relations:[],observations:[],evidence:[]};const bytes=JSON.stringify(data);await fs.writeFile(path.join(dir,'snapshot.json'),bytes);
  const app=new Store(dir);app.pool=pool;await app.init({deferData:true});
  await db.query("INSERT INTO ocean_intel.runs(id,payload) VALUES('current',$1)",[data]);
  await db.exec("CREATE SCHEMA classification;CREATE TABLE classification.jobs(id int,version text,config jsonb,scope jsonb,started_at timestamptz,finished_at timestamptz,status text);");
  await db.query("INSERT INTO classification.jobs(id,version,config,scope,status) VALUES(1,'rules-v1',$1,'{}','completed')",[{rules:[]}]);
  process.env.INTEL_PRESERVE_STARTUP_DATA='true';await app.init();
  assert.equal(app.data.industryRulePublication.jobId,1);
  assert.deepEqual((await db.query("SELECT payload FROM ocean_intel.runs WHERE id='current'")).rows[0].payload,data);
  assert.equal(await fs.readFile(path.join(dir,'snapshot.json'),'utf8'),bytes);
 }finally{if(old===undefined)delete process.env.INTEL_PRESERVE_STARTUP_DATA;else process.env.INTEL_PRESERVE_STARTUP_DATA=old;await fs.rm(dir,{recursive:true,force:true});}
}));
