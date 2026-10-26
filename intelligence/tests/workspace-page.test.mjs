import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {Worker} from 'node:worker_threads';
import {rawFixture} from './strategy-fixture.mjs';import {getQuantCatalog} from '../quant-routes.mjs';import {queryData} from '../insight-data.mjs';import {readStrategyCatalog,StrategyRepository} from '../strategy/service.mjs';import {quantPage,workspaceIdentity,normalizeWorkspaceQuery} from '../workspace-page.mjs';import {chartCaption} from '../quant-preview/chart-caption.js';import {availableViews} from '../quant-preview/chart-views.js';
test('light chart pages keep exact captions, available views, counts and cohorts without transferring all evidence',async()=>{
 const raw=await rawFixture(),catalog=getQuantCatalog(raw,{}),head=quantPage(catalog,'version',{sources:[]});assert.equal(head.cards.length,catalog.cards.length);assert.equal(head.snapshotAt,catalog.snapshotAt);assert.deepEqual(head.audit,catalog.audit);assert.ok(!Object.hasOwn(head,'officialRecords'));
 for(const [i,c]of head.cards.entries()){assert.deepEqual(c.caption,chartCaption(catalog.cards[i]));assert.deepEqual(c.availableViews,availableViews(catalog.cards[i]));assert.equal(c.rowCount,catalog.cards[i].rows.length);assert.deepEqual(c.rows,[]);assert.equal(c.deferred,true);if(c.cohorts)assert.deepEqual(c.cohorts.map(r=>r.rowCount),catalog.cards[i].cohorts.map(r=>r.rows.length));}
 assert.deepEqual(normalizeWorkspaceQuery('inventory',{kind:'documents',page:'1',pageSize:'25',q:'',country:'CN'}),{country:'CN'});assert.throws(()=>normalizeWorkspaceQuery('quant',{unsupported:''}));
});
test('research catalogue reads never create directories or rewrite derived study indexes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'workspace-readonly-')),raw=await rawFixture(),repo=new StrategyRepository(dir,{readOnly:true});try{const result=await readStrategyCatalog({data:raw,researchByIds:async()=>[]},dir,{}, {repository:repo});assert.equal(result.assets.savedVersions,0);assert.equal(result.methodAdvisor.aiAvailable,false);assert.ok(result.methods.length>100);assert.deepEqual(await fs.readdir(dir),[]);await assert.rejects(repo.save({}));await assert.rejects(repo.writeIndex({}));}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('compute worker preserves data pool scope, pagination and original chart rows across version changes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'workspace-compute-')),raw=await rawFixture();raw.documents=Array.from({length:30},(_,i)=>({...raw.documents[0],id:'doc-'+i,title:'资料 '+i,titleZh:'资料 '+i}));const identity=workspaceIdentity(raw),worker=new Worker(new URL('../workspace-compute-worker.mjs',import.meta.url),{workerData:{dir,snapshot:raw,identity},env:{APP_ID:'ocean'},execArgv:[]});let counter=0;const pending=new Map();worker.on('message',m=>{if(m.initialized)return;const r=pending.get(m.id);pending.delete(m.id);m.error?r.reject(Object.assign(Error(m.error.message),m.error)):r.resolve(m.value);});const job=message=>new Promise((resolve,reject)=>{const id=++counter;pending.set(id,{resolve,reject});worker.postMessage({...message,id});});
 try{const ready=await job({type:'warm'});assert.equal(ready.views['inventory:{}'].items.length,25);assert.equal(ready.views['research:{}'].assets.savedVersions,0);
  for(const params of [{},{kind:'all'},{page:'2',pageSize:'25'},{q:'资料 2'},{sourceId:'missing'},{from:'2025-01-01',to:'2025-01-01'},{topic:'海上风电'},{kind:'evidence'}]){const r=await job({type:'inventory',params});const {snapshotAt,filterOptions,workspaceView,...actual}=r;assert.deepEqual(actual,queryData(raw,params));}
  const catalog=getQuantCatalog(raw,{}),first=catalog.cards[0],detail=await job({type:'card',params:{id:first.id,version:identity}});assert.deepEqual(detail.card,first);
  await assert.rejects(job({type:'warm',identity:'invalid',snapshot:{...raw,industryRuleConfig:undefined}}));assert.deepEqual((await job({type:'card',params:{id:first.id,version:identity}})).card,first);
  const next={...raw,generatedAt:'2026-10-18',documents:raw.documents.slice(0,1)};await job({type:'warm',identity:workspaceIdentity(next),snapshot:next});assert.equal((await job({type:'inventory'})).total,1);assert.deepEqual((await job({type:'card',params:{id:first.id,version:identity}})).card,first);await assert.rejects(job({type:'card',params:{id:'missing',version:identity}}),{status:404});
 }finally{await worker.terminate();await fs.rm(dir,{recursive:true,force:true});}
});

test('bounded snapshots retain full source text, classifications, provenance and exact edit revisions',async()=>{
 const {projectWorkspaceSnapshot}=await import('../workspace-snapshot.mjs'),{setRecordRevisions}=await import('../insight-data.mjs'),raw=await rawFixture();raw.documents[0].extraction={diagnostics:'x'.repeat(500000),entities:Array.from({length:1000},(_,i)=>({id:i}))};raw.documents[0].chunks=[{text:'unused chunk copy'}];raw.documents[0].embedding=Array(1000).fill(1);raw.documents[0].autoExtraction={status:'completed',providerResponse:'x'.repeat(500000)};
 const {snapshot,revisions}=await projectWorkspaceSnapshot(raw);setRecordRevisions(snapshot,revisions);assert.equal(snapshot.documents[0].content,raw.documents[0].content);assert.equal(snapshot.documents[0].extraction,undefined);assert.equal(snapshot.documents[0].autoExtraction.status,'completed');assert.ok(JSON.stringify(snapshot).length<JSON.stringify(raw).length/5);
 for(const filters of [{kind:'all'},{kind:'documents'},{kind:'evidence'},{country:'US'},{sourceId:'eia'},{topic:'海上风电'}])assert.deepEqual(queryData(snapshot,filters),queryData(raw,filters));
 const a=getQuantCatalog(raw,{}),b=getQuantCatalog(snapshot,{});const {generatedAt:_a,...before}=a,{generatedAt:_b,...after}=b;assert.deepEqual(after,before);
});

test('compute restarts from a private seed only for its own subsystem and retains edit revisions',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'workspace-seed-')),raw=await rawFixture(),{projectWorkspaceSnapshot}=await import('../workspace-snapshot.mjs'),{snapshot,revisions}=await projectWorkspaceSnapshot(raw),identity=workspaceIdentity(raw);
 await fs.writeFile(path.join(dir,'workspace-input.json'),JSON.stringify({schema:1,scope:'ocean-test',identity,snapshot,revisions:[...revisions]}),{mode:0o600});
 for(const scope of ['ocean-test','different-profile']){
  const worker=new Worker(new URL('../workspace-compute-worker.mjs',import.meta.url),{workerData:{dir,scope,identity:'head'},env:{APP_ID:'ocean'},execArgv:[]});
  try{const initialized=await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});assert.equal(initialized.identity,scope==='ocean-test'?identity:null);
   const response=new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});worker.postMessage({id:1,type:'inventory'});const result=await response;
   if(scope==='ocean-test'){const {snapshotAt,filterOptions,workspaceView,...actual}=result.value;assert.equal(workspaceView.version,identity);assert.deepEqual(actual,queryData(raw,{}));}else assert.equal(result.error.status,409);
  }finally{await worker.terminate();}
 }
 await fs.rm(dir,{recursive:true,force:true});
});
