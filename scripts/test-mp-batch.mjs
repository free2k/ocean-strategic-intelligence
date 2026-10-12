import assert from 'node:assert/strict';import {planImport,articleURL,runBatch} from '../server/integrations/mp2rss-batch.mjs';
const subs=[{id:'mp:1',present:true,payload:{platform:'mp',name:'海洋知圈'}}];
assert.deepEqual(planImport('海洋知圈\n新公众号\nhttps://mp.weixin.qq.com/s/a\nhttps://mp.weixin.qq.com/s/a\nhttps://evil.test/s/a',subs).map(r=>r.status),['existing','needs_link','ready','duplicate','invalid']);
assert.equal(articleURL('https://mp.weixin.qq.com@evil.test/s/a'),null);assert.equal(articleURL('https://mp.weixin.qq.com/other'),null);
const writes=[],pool={query:async(sql,values)=>{writes.push([sql,values]);return {rows:[{present:true,payload:{remoteId:'1'}}]};}};
let calls=0;const r=await runBatch({id:1,action:'batch_subscribe',request:['a','b'],result:{batch:[{value:'a',status:'running'},{value:'b',status:'queued'}]}},pool,async()=>{calls++;},async()=>{});
assert.equal(calls,1);assert.deepEqual(r.map(x=>x.status),['uncertain','completed']);
const fail=await runBatch({id:2,action:'batch_subscribe',request:['a','b']},pool,async()=>{if(++calls===2)throw Error('network');},async()=>{});assert.deepEqual(fail.map(x=>x.status),['failed','completed']);
assert.ok(writes.length>=5);console.log('Batch parsing, validation, interrupted-request recovery and partial-failure tests passed');
