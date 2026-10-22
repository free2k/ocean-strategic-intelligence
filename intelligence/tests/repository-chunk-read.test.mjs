import test from 'node:test';
import assert from 'node:assert/strict';
import {PostgresResearchRepository} from '../research/repositories.mjs';

test('chunked reads never serialize the hydrated registry and isolate callers',async t=>{
 const id='registry_'+'a'.repeat(64);
 const root=JSON.stringify({kind:'registry',_chunkedFields:{objects:2}});
 const parts=[{payload:'[{"id":"one","history":[1]}]'},{payload:'[{"id":"two","history":[2]}]'}];
 let reads=0;
 const repo=new PostgresResearchRepository({query:async(sql)=>{
  if(sql.includes('record_parts'))return {rows:parts};
  reads++;return {rows:[{payload:root}]};
 }});
 const stringify=JSON.stringify;
 t.mock.method(JSON,'stringify',function(value,...args){
  if(value?.kind==='registry'&&value.objects)throw new RangeError('Invalid string length');
  return stringify(value,...args);
 });
 const [a,b]=await Promise.all([repo.read(id),repo.read(id)]);
 assert.equal(reads,1);
 assert.deepEqual(a.objects.map(o=>o.id),['one','two']);
 a.objects[0].history.push(3);
 assert.deepEqual(b.objects[0].history,[1]);
 assert.deepEqual((await repo.read(id)).objects[0].history,[1]);
 assert.equal(reads,1);
 assert.equal(repo.records.get(id),root);
});

test('missing chunks fail closed and unchunked records remain independent',async()=>{
 const id='registry_'+'b'.repeat(64);
 const repo=new PostgresResearchRepository({query:async sql=>({rows:sql.includes('record_parts')?[]:[{payload:'{"kind":"registry","_chunkedFields":{"objects":1}}'}]})});
 await assert.rejects(repo.read(id),{code:'RECORD_PARTS_MISSING'});
 const plain=new PostgresResearchRepository({query:async()=>({rows:[{payload:'{"kind":"registry","objects":[]}'}]})});
 (await plain.read(id)).objects.push({id:'changed'});
 assert.deepEqual((await plain.read(id)).objects,[]);
});
