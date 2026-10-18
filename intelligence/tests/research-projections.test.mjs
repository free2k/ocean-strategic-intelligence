import test from 'node:test';
import assert from 'node:assert/strict';
import {PostgresResearchRepository} from '../research/repositories.mjs';
import {readObjects} from '../research/objects.mjs';
import {readMonitorSummary} from '../research/monitor-summary.mjs';

test('Postgres projections preserve merged objects, scoped histories and summary comparisons', {skip:!process.env.TEST_PROJECTION_DATABASE_URL}, async()=>{
 const {default:pg}=await import('pg');const client=new pg.Client({connectionString:process.env.TEST_PROJECTION_DATABASE_URL});await client.connect();
 try{
  await client.query('CREATE TEMP TABLE projection_records (id text PRIMARY KEY,payload jsonb)');
  const id='registry_'+'a'.repeat(64),ref=(documentId,snapshotId='s')=>({documentId,snapshotId,publishedAt:'2026-01-01',sourceId:'source'});
  const object=(id,docs,extra={})=>({id,name:id,aliases:[],documentRefs:docs,eventIds:['e'],relationIds:['r'],factIds:['f'],metrics:[],...extra});
  const registry={kind:'registry',objects:[object('a',[ref('d'),ref('d','old')]),object('b',[ref('d2')],{mergedInto:'a'}),object('c',[ref('outside')])],events:[{id:'e',versions:[{...ref('d','old'),title:'before'},{...ref('d'),title:'after'},{...ref('outside'),title:'outside'}]}],relations:[{id:'r',from:'a',to:'c',versions:[ref('d'),ref('outside')]}],facts:[{id:'f',versions:[ref('d2'),ref('outside')]}],operations:[{sourceId:'b',targetId:'a',reason:'verified merge'},{sourceId:'c',targetId:'other'}]};
  await client.query('INSERT INTO projection_records VALUES ($1,$2)',[id,registry]);
  const projection=new PostgresResearchRepository({query:(sql,args)=>client.query(sql.replaceAll('ocean_research.records','pg_temp.projection_records'),args)});
  const release={releaseId:'release',objectRegistryId:id,snapshotId:'s',batchId:'batch'},snapshot={entries:['d','d2'].map(documentId=>({documentId,body:{title:documentId,sourceId:'source',publishedAt:'2026-01-01'},classification:{status:'accepted'}})),sources:[]},batch={changes:[{documentId:'d',types:['body_updated']}],counts:{changes:{body_updated:1}}};
  const ledger=repository=>({repository,resolveRelease:async()=>release,resolve:async()=>({release,snapshot}),batch:async()=>batch});
  const full=ledger({read:async()=>structuredClone(registry)}),fast=ledger(projection);
  for(const docs of [null,new Set(['d'])])assert.deepEqual(await readObjects(fast,{},'a',docs),await readObjects(full,{},'a',docs));
  const expected=await readMonitorSummary(full);assert.equal(expected.data.comparisonCount,1);assert.equal(expected.data.comparisons[0].before.title,'before');assert.deepEqual(await readMonitorSummary(fast),expected);
  await assert.rejects(readObjects(fast,{},'missing'),{code:'OBJECT_NOT_FOUND'});
  await assert.rejects(readObjects(fast,{sourceId:'unknown'},'a'),{code:'OBJECT_SCOPE_MISMATCH'});
 }finally{await client.end();}
});
