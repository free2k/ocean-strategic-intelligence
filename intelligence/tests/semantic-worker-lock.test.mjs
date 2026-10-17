import test from 'node:test';
import assert from 'node:assert/strict';
import {processSemanticQueue,inputHash} from '../semantic-classification.mjs';
test('review commits with an article lock and durable delivery marker, without taking the channel sync lock',async()=>{
 const article={id:1,title:'title',content:'body',filter_status:'pending'};
 const q={article_id:1,input_hash:inputHash(article.title,article.content),version:'v',config:{},decision:{}};
 const calls=[];const query=async(sql)=>{
  calls.push(sql);
  if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
  if(sql.startsWith('SELECT * FROM classification.semantic_queue'))return {rows:[q]};
  if(sql.startsWith('SELECT a.id'))return {rows:[article]};
  if(sql.startsWith('SELECT decision'))return {rows:[{decision:{status:'accepted',primary:'海洋油气'}}]};
  return {rows:[],rowCount:0};
 };
 const guard={query,release(){}};const pool={query,connect:async()=>guard};
 const result=await processSemanticQueue(pool);
 assert.equal(result.completed,1);assert.equal(result.accepted,1);
 assert.ok(!calls.some(sql=>sql.includes('73201910')));
 const articleLock=calls.findIndex(sql=>sql.includes('public.articles WHERE id=$1 FOR UPDATE'));
 const queueLock=calls.findIndex(sql=>sql.includes('semantic_queue WHERE article_id=$1 FOR UPDATE'));
 assert.ok(articleLock>=0&&articleLock<queueLock);
 const marker=calls.findIndex(sql=>sql.includes("VALUES('intelligence-delivery'"));
 assert.ok(marker>articleLock&&marker<calls.indexOf('COMMIT'));
});
