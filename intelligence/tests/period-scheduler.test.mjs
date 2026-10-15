import test from 'node:test';
import assert from 'node:assert/strict';
import {createPeriodScheduler} from '../research/period-scheduler.mjs';
import {periodChartData} from '../public/period-charts.js';

test('Beijing midnight catch-up, persistent daily identity, publish and no duplicate calls',async()=>{
 let now='2026-10-15T15:59:59Z',calls=0,publishes=0;
 const jobs=[],reports={list:async()=>jobs,get:async id=>jobs.find(j=>j.id===id),create:async input=>{calls++;const j={id:String(calls),requestId:input.requestId,range:{from:input.from,to:input.to},status:'ready'};jobs.push(j);return j;},publish:async id=>{publishes++;jobs.find(j=>j.id===id).status='published';}};
 const s=createPeriodScheduler(reports,{clock:()=>new Date(now),interval:1e8});
 await new Promise(r=>setTimeout(r,5));
 assert.equal(jobs[0].range.to,'2026-10-15');await s.tick();assert.equal(calls,1);
 now='2026-10-15T16:00:01Z';await s.tick();assert.equal(calls,2);assert.equal(jobs[1].range.from,'2026-10-10');assert.equal(publishes,2);s.stop();
 const restarted=createPeriodScheduler(reports,{clock:()=>new Date(now),interval:1e8});await new Promise(r=>setTimeout(r,5));assert.equal(calls,2);restarted.stop();
 jobs[1].status='failed';const failed=createPeriodScheduler(reports,{clock:()=>new Date(now),interval:1e8});await new Promise(r=>setTimeout(r,5));await failed.tick();assert.equal(calls,2);failed.stop();
});
test('no scheduler activity when disabled; waits for other running work',async()=>{
 let calls=0;const reports={list:async()=>[{status:'running'}],create:async()=>{calls++;}};
 const s=createPeriodScheduler(reports,{interval:1e8});await new Promise(r=>setTimeout(r,5));assert.equal(calls,0);s.stop();
 const disabled=createPeriodScheduler({list:()=>{throw Error('disabled');}},{enabled:false});await disabled.tick();disabled.stop();
});
test('charts reconcile source, industry, dates and Beijing hours for each saved run',()=>{
 const range={from:'2026-10-10',to:'2026-10-16'},domains=[{name:'Oil',topic:'oil'},{name:'Wind',topic:'wind'}];
 const doc=(topic,publishedAt,sourceName)=>({classification:{primary:topic},sourceName,body:{publishedAt}});
 const documents=[doc('oil','2026-10-09T16:00:00Z','A'),doc('wind','2026-10-16T15:59:59Z','B'),doc('oil','2026-10-16T16:00:00Z','outside')];
 const data=periodChartData({range,domains,documents});assert.equal(data.total,2);assert.deepEqual(data.domains.map(d=>d.count),[1,1]);assert.equal(data.days.length,7);assert.deepEqual(data.hours,[[0,0,1],[6,23,1]]);assert.equal(data.sources.reduce((n,s)=>n+s[1],0),2);assert.equal(data.domains.flatMap(d=>d.daily).reduce((a,b)=>a+b,0),2);
 assert.equal(periodChartData({range,domains,documents:documents.slice(0,1)}).total,1);
});
