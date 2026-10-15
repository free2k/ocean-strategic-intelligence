import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {ResearchLedger} from '../research/ledger.mjs';
import {FileResearchRepository} from '../research/repositories.mjs';
import {readBatchReplay} from '../research/replay.mjs';
import {attachPublishedRules} from '../published-rules.mjs';
import {standardTopics} from '../industry-topics.mjs';
import {serveResearchRead} from '../research/routes.mjs';
const doc=(id,topic,status='accepted')=>({id,title:id,content:'海上风电 原始正文',sourceId:id,industry:{status,primary:status==='accepted'?topic:null,positive:[{topic,keywords:[{keyword:'海上风电',field:'正文'}]}],negative:status==='excluded'?[{keyword:'招聘',field:'标题'}]:[]}});
async function setup(t,documents){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'research-replay-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const ledger=new ResearchLedger(new FileResearchRepository(dir));const data={documents,sources:[],entities:[]};attachPublishedRules(data,{id:1,config:{rules:[]}});const release=await ledger.publish(data,{baseline:true,expectedReleaseId:null});return {ledger,data,release};}
test('replay selects at most six with primary-domain coverage and explicit baseline semantics',async t=>{
 const docs=standardTopics.flatMap((topic,i)=>[doc('a'+i,topic.id),doc('b'+i,topic.id)]),{ledger}=await setup(t,docs),result=await readBatchReplay(ledger);
 assert.equal(result.data.kind,'migration_baseline');assert.equal(result.data.samples.length,6);assert.equal(new Set(result.data.samples.map(s=>s.topic)).size,6);assert.equal(result.data.counts.changes.new_document,0);assert.equal(result.data.playback.phases.reduce((n,p)=>n+p.seconds,0),12);assert.equal(result.meta.replayOnly,true);
});
test('each primary domain picks its newest saved-body evidence, not its smallest ID',async t=>{
 const docs=standardTopics.flatMap(topic=>[
  {...doc('a-old-'+topic.id,topic.id),publishedAt:'2026-10-08T00:00:00Z'},
  {...doc('z-new-'+topic.id,topic.id),publishedAt:'2026-10-14T00:00:00Z'},
  {...doc('b-missing-body-'+topic.id,topic.id),publishedAt:'2026-10-15T00:00:00Z',content:''},
  {...doc('c-unknown-date-'+topic.id,topic.id),publishedAt:null}
 ]);
 const {ledger}=await setup(t,docs),result=await readBatchReplay(ledger);
 assert.deepEqual(result.data.samples.map(s=>s.documentId),standardTopics.map(t=>'z-new-'+t.id));
 assert.equal(result.data.omittedFromReplay,6);
});
test('same-date candidates are deterministic and a sparse batch does not borrow older-batch articles',async t=>{
 const {ledger,data,release}=await setup(t,[
  {...doc('b','海洋油气'),publishedAt:'2026-10-14T00:00:00Z'},
  {...doc('a','海洋油气'),publishedAt:'2026-10-14T00:00:00Z'},
  {...doc('other-domain','海洋装备'),publishedAt:'2026-10-15T00:00:00Z'}
 ]);
 assert.equal((await readBatchReplay(ledger)).data.samples[0].documentId,'a');
 data.documents[0].content='本批次补充正文';
 const next=await ledger.publish(data,{expectedReleaseId:release.releaseId});
 const result=await readBatchReplay(ledger,{releaseId:next.releaseId});
 assert.deepEqual(result.data.samples.map(s=>s.documentId),['b']);
 assert.equal(result.data.documents.length,3);
});
test('only affected documents enter replay; old evidence remains pinned after a newer release',async t=>{
 const {ledger,data,release}=await setup(t,[doc('d1','海洋油气'),doc('d2','海洋装备')]);data.documents[0].content='第二版正文';const second=await ledger.publish(data,{expectedReleaseId:release.releaseId});const result=await readBatchReplay(ledger,{releaseId:second.releaseId});assert.deepEqual(result.data.samples.map(s=>s.documentId),['d1']);assert.equal(result.data.counts.snapshotClassification.total,2);assert.equal(result.data.counts.processedClassification.total,1);
 data.documents[0].content='第三版正文';await ledger.publish(data,{expectedReleaseId:second.releaseId});const again=await readBatchReplay(ledger,{releaseId:second.releaseId});assert.deepEqual(again,result);const sample=again.data.samples[0],original=await ledger.document(sample.documentId,sample.bodyVersionId,{releaseId:second.releaseId});assert.equal(original.data.content,'第二版正文');assert.ok(sample.evidenceUrl.includes(second.releaseId));
});
test('excluded cases use recorded negative hits; missing evidence never becomes synthetic replay',async t=>{
 const {ledger}=await setup(t,[doc('a','海洋油气'),doc('b','海洋油气','excluded'),{id:'c',industry:{status:'unmatched'}},{id:'d',industry:{status:'accepted',primary:'海洋装备'}}]);const result=await readBatchReplay(ledger);assert.deepEqual(result.data.samples.map(s=>s.documentId),['a','b']);assert.equal(result.data.omittedFromReplay,2);assert.equal(result.data.samples[1].classification.negative[0].keyword,'招聘');assert.equal(result.data.counts.snapshotClassification.total,4);
});
test('no keyword case returns an explicit empty state while retaining summary counts',async t=>{const {ledger}=await setup(t,[{id:'d'}]);const result=await readBatchReplay(ledger);assert.equal(result.data.samples.length,0);assert.equal(result.data.emptyReason,'NO_RECORDED_KEYWORD_CASES');assert.equal(result.data.counts.snapshotClassification.unclassified,1);});
test('shared filters select the same documents for samples, summary and list, with Beijing end date inclusive',async t=>{
 const a={...doc('a','海上风电'),sourceId:'s',publishedAt:'2026-10-14T15:59:59Z'},b={...doc('b','海上风电'),sourceId:'s',publishedAt:'2026-10-14T16:00:00Z'},c={...doc('c','海洋油气'),sourceId:'other',publishedAt:'2026-10-14T01:00:00Z'};
 const {ledger}=await setup(t,[a,b,c]);const result=await readBatchReplay(ledger,{topic:'海洋新能源',sourceId:'s',from:'2026-10-14',to:'2026-10-14'});assert.deepEqual(result.data.documents.map(d=>d.id),['a']);assert.deepEqual(result.data.samples.map(d=>d.documentId),['a']);assert.equal(result.data.counts.snapshotClassification.total,1);assert.equal(result.data.counts.affectedDocuments,1);await assert.rejects(()=>readBatchReplay(ledger,{to:'2026-02-30'}),{code:'INVALID_SCOPE'});await assert.rejects(()=>readBatchReplay(ledger,{country:'CN'}),{code:'UNSUPPORTED_SCOPE'});
});
test('replay HTTP endpoint supports conditional reads and rejects incompatible scope or version',async t=>{
 const {ledger,release}=await setup(t,[doc('d','海洋油气')]);const server=http.createServer(async(req,res)=>{try{if(!await serveResearchRead(req,res,new URL(req.url,'http://localhost'),ledger)){res.writeHead(404);res.end();}}catch{res.writeHead(500);res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const url='http://127.0.0.1:'+server.address().port+'/api/research/replay';
 const response=await fetch(url);assert.equal(response.status,200);assert.equal((await response.json()).meta.releaseId,release.releaseId);assert.equal((await fetch(url,{headers:{'If-None-Match':response.headers.get('etag')}})).status,304);assert.equal((await fetch(url+'?country=CN')).status,400);assert.equal((await fetch(url+'?releaseId='+release.releaseId+'&snapshotId=wrong')).status,409);assert.equal((await fetch(url,{method:'POST'})).status,405);
});
test('published history is paged without duplicates and rejects unpublished cursors',async t=>{
 const {ledger,data,release}=await setup(t,[doc('d','海洋油气')]);let head=release;
 for(let i=0;i<21;i++){data.documents[0].content='body revision '+i;head=await ledger.publish(data,{expectedReleaseId:head.releaseId});}
 async function read(query=''){let status,body;const res={writeHead:s=>{status=s;},end:s=>{body=JSON.parse(s);}};await serveResearchRead({method:'GET',headers:{}},res,new URL('http://localhost/api/research/releases'+query),ledger);return {status,body};}
 const first=await read();assert.equal(first.status,200);assert.equal(first.body.data.length,20);assert.equal(first.body.data[0].releaseId,head.releaseId);
 const second=await read('?cursor='+first.body.nextCursor);assert.equal(second.body.data.length,2);assert.equal(second.body.nextCursor,null);assert.equal(new Set([...first.body.data,...second.body.data].map(r=>r.releaseId)).size,22);
 assert.notEqual((await read('?cursor=release_'+'a'.repeat(64))).status,200);assert.equal((await read('?country=CN')).status,400);
});
