import test from 'node:test';import assert from 'node:assert/strict';import {PostgresResearchRepository} from '../research/repositories.mjs';
test('immutable read cache coalesces requests, isolates mutations, and does not cache missing records',async()=>{
 let calls=0,value={kind:'registry',objects:[{name:'original'}]};const pool={query:async()=>{calls++;await new Promise(r=>setTimeout(r,5));return {rows:value?[{payload:value}]:[]};}};
 const repo=new PostgresResearchRepository(pool),id='registry_'+'a'.repeat(64);
 const [a,b]=await Promise.all([repo.read(id),repo.read(id)]);assert.equal(calls,1);a.objects[0].name='edited';assert.equal(b.objects[0].name,'original');assert.equal((await repo.read(id)).objects[0].name,'original');
 const missing='registry_'+'b'.repeat(64);value=null;assert.equal(await repo.read(missing),null);value={kind:'registry'};assert.deepEqual(await repo.read(missing),value);assert.equal(calls,3);
});
