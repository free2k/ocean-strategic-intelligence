import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const code=await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8');
const start=code.indexOf('const readCache='),end=code.indexOf('\n}',start)+2;
function harness(){
 let calls=0,now=0,fail=false,invalidations=0,sensingCalls=0;
 const context=vm.createContext({Map,Date:{now:()=>now},$:()=>({}),invalidateSensingCache:()=>invalidations++,sensingGet:async path=>{sensingCalls++;return {path};},fetch:async()=>{calls++;await Promise.resolve();return {status:fail?500:200,ok:!fail,json:async()=>fail?{error:'failed'}:{version:calls}};}});
 const api=vm.runInContext(code.slice(start,end)+'\napi',context);
 return {api,calls:()=>calls,invalidations:()=>invalidations,sensingCalls:()=>sensingCalls,tick:()=>now+=61000,fail:value=>fail=value};
}
test('toolbar statistics use the same loader as the sources page and writes invalidate both',async()=>{
 const h=harness();assert.equal((await h.api('sensing-summary')).path,'api/sensing-summary');assert.equal(h.sensingCalls(),1);assert.equal(h.calls(),0);
 await h.api('events',{});assert.equal(h.invalidations(),1);
});
test('navigation coalesces reads, isolates filters and expires cached snapshots',async()=>{
 const h=harness();await Promise.all([h.api('data?country=US'),h.api('data?country=US')]);assert.equal(h.calls(),1);
 await h.api('data?country=US');assert.equal(h.calls(),1);
 await h.api('data?country=CN');assert.equal(h.calls(),2);
 h.tick();await h.api('data?country=US');assert.equal(h.calls(),3);
});
test('writes invalidate snapshots and failed reads never poison the cache',async()=>{
 const h=harness();await h.api('data?');await h.api('events',{});await h.api('data?');assert.equal(h.calls(),3);
 h.tick();h.fail(true);await assert.rejects(h.api('data?'));h.fail(false);await h.api('data?');assert.equal(h.calls(),5);
});

test('overview metadata cannot satisfy a relationship or complete-list request',async()=>{
 const h=harness(),summary=await h.api('data?country=CN&projection=summary');
 const [graph,full]=await Promise.all([h.api('data?country=CN&projection=relations'),h.api('data?country=CN&projection=full')]);
 assert.equal(h.calls(),3);assert.notEqual(summary.version,graph.version);assert.notEqual(summary.version,full.version);
 assert.equal(await h.api('data?country=CN&projection=summary'),summary);
 assert.equal(await h.api('data?country=CN&projection=relations'),graph);assert.equal(h.calls(),3);
});

// D02 replaces cross-menu resets; shared-state behavior is tested in navigation-state.test.mjs and browser QA.
