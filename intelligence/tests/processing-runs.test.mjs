import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {ProcessingRuns,reviewCutoff,tooOld} from '../processing-runs.mjs';
const input=()=>({capturedAt:'2026-10-17T00:00:00Z',config:{rules:[{id:1,type:'include',topic:'海上风电',title_keywords:['海上风电'],content_keywords:[]}]},documents:[{id:'a',title:'海上风电项目投产',content:'海上风电项目于2026年10月16日正式投产。',sourceName:'测试渠道',publishedAt:'2026-10-16T00:00:00Z',classification:{status:'unmatched'}}]});
const facts=()=>({events:[{id:'e',documentId:'a',title:'投产'}],entities:[{id:'n',name:'风电项目'}],relations:[],observations:[],evidence:[],rejected:[]});
async function setup(options={}){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'processing-runs-'));const data=input();const manager=new ProcessingRuns({dir,readInput:async()=>structuredClone(data),clock:()=>new Date().toISOString(),client:{},extract:async()=>facts(),...options});await manager.recover();return {dir,data,manager,cleanup:()=>fs.rm(dir,{recursive:true,force:true})};}
test('same request is idempotent; concurrent new requests cannot start a second active run',async()=>{
 let release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);const x=await setup({extract:async()=>{entered();await gate;return facts();}});
 try{const p=await x.manager.preview();const request={confirmed:true,requestId:'request-one',previewToken:p.previewToken};const first=await x.manager.start(request);await ready;
 assert.equal((await x.manager.start(request)).id,first.id);
 await assert.rejects(()=>x.manager.start({...request,requestId:'request-two'}),/已有任务/);
 release();await x.manager.workers.get(first.id);const done=await x.manager.current();assert.equal(done.status,'completed');assert.equal(done.facts.events,1);
 assert.equal(JSON.parse(await fs.readFile(path.join(x.dir,'published.json'))).taskId,first.id);
 }finally{release?.();await x.cleanup();}
});
test('stop requires confirmation and keeps exclusivity until the in-flight operation has exited',async()=>{
 let release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);const x=await setup({extract:async()=>{entered();await gate;return facts();}});
 try{const p=await x.manager.preview(),t=await x.manager.start({confirmed:true,requestId:'request-stop',previewToken:p.previewToken});await ready;
 await assert.rejects(()=>x.manager.stop(t.id,{confirmed:false}),/确认/);
 assert.equal((await x.manager.stop(t.id,{confirmed:true})).status,'stopping');
 await assert.rejects(()=>x.manager.start({confirmed:true,requestId:'request-next',previewToken:p.previewToken}),/已有任务/);
 release();await x.manager.workers.get(t.id);assert.equal((await x.manager.current()).status,'interrupted');await assert.rejects(()=>fs.access(path.join(x.dir,'published.json')));
 }finally{release?.();await x.cleanup();}
});
test('failed extraction records a retry and publication remains explicitly partial',async()=>{
 const x=await setup({extract:async()=>{throw Object.assign(Error('timed out'),{name:'TimeoutError'});}});
 try{const p=await x.manager.preview(),t=await x.manager.start({confirmed:true,requestId:'request-fail',previewToken:p.previewToken});await x.manager.workers.get(t.id);const done=await x.manager.current();assert.equal(done.status,'partial');assert.equal(done.retries[0].errorType,'timeout');assert.equal(done.facts.events,0);assert.ok(done.logs.some(l=>l.type==='retry'));}finally{await x.cleanup();}
});
test('changed rules invalidate confirmation; manual articles never enter the run',async()=>{
 const x=await setup();try{const p=await x.manager.preview();x.data.config.rules[0].title_keywords.push('new');await assert.rejects(()=>x.manager.start({confirmed:true,requestId:'request-rules',previewToken:p.previewToken}),/变化/);x.data.documents[0].manual=true;assert.equal((await x.manager.preview()).count,0);}finally{await x.cleanup();}
});
test('rolling three-month window uses Beijing calendar dates and handles month ends',()=>{
 assert.equal(reviewCutoff(new Date('2026-10-17T12:00:00Z')),'2026-07-17');assert.equal(reviewCutoff(new Date('2026-05-31T12:00:00Z')),'2026-02-28');assert.equal(tooOld('2026-07-16T15:59:59Z','2026-07-17'),true);assert.equal(tooOld('2026-07-16T16:00:00Z','2026-07-17'),false);assert.ok(!tooOld(null,'2026-07-17'));
});

test('live publisher receives durable article results and releases guard after publication',async()=>{
 let released=false,published=false;
 const x=await setup({mode:'live',acquire:async()=>async()=>{released=true;},loadDocument:async d=>({...d,content:d.content+' 补充正文。'}),publish:async({task,readResults})=>{assert.equal(released,false);const rows=await readResults();assert.equal(rows.length,1);assert.ok(rows[0].document.content.includes('补充正文'));assert.equal(rows[0].extraction.events[0].title,'投产');published=true;return {mode:'live',releaseId:'release-test'};}});
 try{const p=await x.manager.preview();assert.equal(p.mode,'live');assert.deepEqual(p.documents,[]);const t=await x.manager.start({confirmed:true,requestId:'live-publish',previewToken:p.previewToken});await x.manager.workers.get(t.id);const done=await x.manager.current();assert.equal(done.status,'completed');assert.equal(done.publication.releaseId,'release-test');assert.ok(published&&released);await assert.rejects(()=>fs.access(path.join(x.dir,'published.json')));}finally{await x.cleanup();}
});

test('external scheduler conflict does not create a new task',async()=>{
 const x=await setup({acquire:async()=>{throw Object.assign(Error('external busy'),{status:409});}});
 try{const p=await x.manager.preview();await assert.rejects(()=>x.manager.start({confirmed:true,requestId:'live-busy',previewToken:p.previewToken}),/external busy/);assert.equal(await x.manager.current(),null);}finally{await x.cleanup();}
});

test('live publication failure is not reported as published and releases guard',async()=>{
 let released=false;const x=await setup({acquire:async()=>async()=>{released=true;},publish:async()=>{throw Error('publication failed');}});
 try{const p=await x.manager.preview(),t=await x.manager.start({confirmed:true,requestId:'live-failure',previewToken:p.previewToken});await x.manager.workers.get(t.id);assert.equal((await x.manager.current()).status,'failed');assert.ok(released);}finally{await x.cleanup();}
});

test('live runs process at most four articles concurrently and wait for all requests on stop',async()=>{
 let inFlight=0,peak=0,release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);
 const x=await setup({mode:'live',extract:async()=>{inFlight++;peak=Math.max(peak,inFlight);if(inFlight===4)entered();await gate;inFlight--;return facts();}});
 x.data.documents=Array.from({length:6},(_,i)=>({...x.data.documents[0],id:'article-'+i}));
 try{const p=await x.manager.preview(),t=await x.manager.start({confirmed:true,requestId:'live-four',previewToken:p.previewToken});await ready;assert.equal(peak,4);await x.manager.stop(t.id,{confirmed:true});release();await x.manager.workers.get(t.id);assert.equal(inFlight,0);assert.equal((await x.manager.current()).status,'interrupted');}finally{release?.();await x.cleanup();}
});

test('older log pages remain available after the bounded runtime log window rolls over',async()=>{
 const x=await setup();try{const p=await x.manager.preview(),t=await x.manager.start({confirmed:true,requestId:'log-pages',previewToken:p.previewToken});await x.manager.workers.get(t.id);await x.manager.update(t.id,s=>{for(let i=0;i<600;i++)x.manager.log(s,'checkpoint','log '+i);});const first=await x.manager.current(0,t.id);assert.equal(first.logs[0].seq,1);assert.equal(first.logs.length,200);const next=await x.manager.current(200,t.id);assert.equal(next.logs[0].seq,201);assert.equal(next.logs.length,200);assert.ok(next.lastSeq>600);}finally{await x.cleanup();}
});

test('scope preview and execution agree; changing scope cannot reuse confirmation',async()=>{
 const x=await setup();x.data.documents=['unmatched','accepted','excluded'].map((status,i)=>({...x.data.documents[0],id:'scope-'+i,classification:{status}}));x.data.documents.push({...x.data.documents[0],id:'manual',manual:true});
 try{for(const scope of ['pending','accepted','excluded'])assert.equal((await x.manager.preview(scope)).count,1);assert.equal((await x.manager.preview('all')).count,3);await assert.rejects(()=>x.manager.preview('invalid'),/无效/);
 const p=await x.manager.preview('accepted');await assert.rejects(()=>x.manager.start({confirmed:true,requestId:'scope-mismatch',processingScope:'all',previewToken:p.previewToken}),/变化/);
 const t=await x.manager.start({confirmed:true,requestId:'scope-accepted',processingScope:'accepted',previewToken:p.previewToken});await x.manager.workers.get(t.id);const done=await x.manager.current();assert.equal(done.processingScope,'accepted');assert.equal(done.processed,1);assert.ok(done.logs.filter(l=>l.documentId).every(l=>l.documentId==='scope-1'));}finally{await x.cleanup();}
});

test('reclassifying an accepted article as excluded removes its automatic facts',async()=>{
 const x=await setup();try{let p=await x.manager.preview(),t=await x.manager.start({confirmed:true,requestId:'before-exclusion',previewToken:p.previewToken});await x.manager.workers.get(t.id);
 x.data.documents[0].classification.status='accepted';x.data.config.rules.push({id:2,type:'exclude',title_keywords:['海上风电'],content_keywords:[]});p=await x.manager.preview('accepted');t=await x.manager.start({confirmed:true,requestId:'after-exclusion',processingScope:'accepted',previewToken:p.previewToken});await x.manager.workers.get(t.id);const pointer=JSON.parse(await fs.readFile(path.join(x.dir,'published.json'))),snapshot=JSON.parse(await fs.readFile(path.join(x.dir,pointer.file)));assert.equal(snapshot.documents[0].industry.status,'excluded');assert.deepEqual(snapshot.events,[]);}finally{await x.cleanup();}
});
