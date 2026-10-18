import test from 'node:test';import assert from 'node:assert/strict';
import {retryReportRead} from '../research/period-retry.mjs';
import {PeriodReports} from '../research/period-reports.mjs';
const transient=()=>Object.assign(new Error('connection lost'),{code:'ECONNRESET'});
test('transient reads retry with a bound; programming errors and ambiguous writes do not',async()=>{
 let n=0;assert.equal(await retryReportRead(()=>{if(++n<3)throw transient();return 42;},{wait:async()=>{}}),42);assert.equal(n,3);
 n=0;await assert.rejects(retryReportRead(()=>{n++;throw transient();},{wait:async()=>{}}),e=>e.reportFailure.attempt===4);assert.equal(n,4);
 n=0;await assert.rejects(retryReportRead(()=>{n++;throw new TypeError('bad data');},{wait:async()=>{}}));assert.equal(n,1);
 n=0;await assert.rejects(retryReportRead(()=>{n++;throw transient();},{lockOnly:true,wait:async()=>{}}));assert.equal(n,1);
});
function fixture(audit,readBody){const s={periodReports:{job:{id:'job',range:{from:'2026-10-12',to:'2026-10-18',start:Date.parse('2026-10-12'),end:Date.parse('2026-10-19')},domains:[],status:'queued'}}};let calls=0;const logs=[];const service=new PeriodReports({state:{transact:async f=>f(s)},audit,readBody,retryWait:async()=>{},onError:e=>logs.push(e),model:{generate:async()=>{calls++;return {content:'{}'};}}});return {s,service,logs,calls:()=>calls};}
const article={id:'a',title:'Article',publishedAt:'2026-10-14',classification:{status:'accepted',primary:'海洋油气'}};
test('audit/body transient failures recover without repeating model generation',async()=>{
 let a=0,b=0;const f=fixture(async()=>{if(++a<3)throw transient();return {documents:[article]};},async d=>{if(++b<2)throw transient();return {...d,content:'Offshore project original evidence and source description.'};});await f.service.run('job');assert.equal(f.s.periodReports.job.status,'ready');assert.equal(f.calls(),1);assert.equal(a,3);assert.equal(b,2);
});
test('exhausted read records stage, document and attempts with no model calls',async()=>{
 const f=fixture(async()=>({documents:[article]}),async()=>{throw transient();});await f.service.run('job');const j=f.s.periodReports.job;assert.equal(j.status,'failed');assert.equal(j.failure.code,'ECONNRESET');assert.equal(j.failure.documentId,'a');assert.equal(j.failure.attempt,4);assert(j.finishedAt);assert.equal(f.calls(),0);assert(f.logs.length>=4);
});
test('state lock contention is retried before applying a mutation',async()=>{
 let attempts=0,mutations=0;const service=new PeriodReports({state:{transact:async f=>{if(++attempts<3)throw Object.assign(new Error('busy'),{code:'SHARED_STATE_BUSY'});mutations++;return f({periodReports:{j:{id:'j'}}});}},onError:()=>{},retryWait:async()=>{}});await service.update('j',{status:'ready'});assert.equal(attempts,3);assert.equal(mutations,1);
});
