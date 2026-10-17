import {test} from 'node:test';
import assert from 'node:assert/strict';
import {queueSemantic,expireSemanticQueue} from '../semantic-classification.mjs';
test('old articles skip AI queue creation and preserve classification',async()=>{
 const queries=[];const db={query:async(sql)=>{queries.push(sql);return {rows:[{expired:true}]};}};
 const base={status:'unmatched',reason:'original'};
 const result=await queueSemantic(db,{id:1,content:'body'},{rules:[],version:'v'},base);
 assert.equal(result.status,'unmatched');assert.equal(result.semantic.status,'expired');
 assert.ok(!queries.some(q=>q.includes('INSERT')));
 assert.ok(queries[1].includes("status IN ('pending','failed')"));
});
test('recent and undated articles still enter the queue',async()=>{
 for(const expired of [false,null]){
  const queries=[];const db={query:async(sql)=>{queries.push(sql);return {rows:sql.startsWith('SELECT')?[{expired}]:[]};}};
  const result=await queueSemantic(db,{id:1,content:'body'},{rules:[],version:'v'},{status:'unmatched'});
  assert.equal(result.semantic.status,'pending');assert.ok(queries.some(q=>q.includes('INSERT')));
 }
});
test('expiry only retires queued or failed entries, leaving completed history untouched',async()=>{
 let query;assert.equal(await expireSemanticQueue({query:async sql=>{query=sql;return {rowCount:7};}}),7);
 assert.ok(query.includes("q.status IN ('pending','failed')"));
 assert.ok(query.includes("interval '3 months'"));assert.ok(query.includes('Asia/Shanghai'));
});
