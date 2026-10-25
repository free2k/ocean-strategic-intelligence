import test from 'node:test';
import assert from 'node:assert/strict';
import {auditInventory,auditInventoryTag,cachedAudit,invalidateAudit} from '../classification-audit.mjs';
import {renderClassificationReview,reviewState} from '../public/classification-review.js';

test('compact article inventories retain filtering and complete current decision explanations',()=>{
 const classification={status:'accepted',primary:'海上风电',positive:[{topic:'海上风电',keywords:[{keyword:'wind',field:'标题'}]}],negative:[],context:{matched:true,hits:[]},semantic:{status:'completed',reason:'saved reason',quote:'original proof',model:'saved model'}};
 const row={id:'one',url:'https://example.test',title:'Wind',sourceId:'source',sourceIds:['source','other'],sourceName:'原始来源',publishedAt:'2026-10-25',channelGroup:'other',classification,classificationConflict:true,classificationOrigin:'articles',classificationRecords:[{origin:'working',classification},{origin:'articles',classification}],articleDecision:{classification},industry:classification,translationCheckpoint:{text:'large unused checkpoint'.repeat(1000)}};
 const audit={observedAt:'now',counts:{total:1,accepted:1,excluded:0,pending:0},documents:[row]},result=auditInventory(audit),compact=result.documents[0];
 assert.deepEqual(result.counts,audit.counts);assert.deepEqual(compact.sourceIds,row.sourceIds);assert.equal(compact.publishedAt,row.publishedAt);
 assert.equal(renderClassificationReview(compact),renderClassificationReview(row));assert.deepEqual(reviewState(compact),reviewState(row));
 assert.deepEqual(compact.classificationRecords.map(r=>[r.origin,r.classification.status,r.classification.primary]),row.classificationRecords.map(r=>[r.origin,r.classification.status,r.classification.primary]));
 assert.ok(JSON.stringify(result).length<JSON.stringify(audit).length/4);assert.ok(row.translationCheckpoint);assert.equal(compact.translationCheckpoint,undefined);
});

function fixture(clock){
 let version='v1',reads=0,failRevision=false,status='accepted',publishedAt='2026-01-01';
 const query=async sql=>{
  if(sql.includes('_audit_revision'))return {rows:[{_audit_revision:version}]};
  if(sql.startsWith('BEGIN'))reads++;
  if(sql==='SELECT now() AS at')return {rows:[{at:new Date(clock.now).toISOString()}]};
  if(sql.includes('FROM public.articles a LEFT JOIN'))return {rows:[{id:1,title:'source title',link:'https://example.test/one',published_at:publishedAt,filter_status:status==='accepted'?'accepted':'rejected',matched_topic:'海上风电',source_name:'source'}]};
  return {rows:[]};
 };
 const pool={connect:async()=>({query,release(){}}),query:async sql=>{if(failRevision)throw Error('revision unavailable');return query(sql);}};
 return {pool,reads:()=>reads,update:()=>{version='v2';status='excluded';},failRevision:()=>{failRevision=true;},future:date=>{publishedAt=date;}};
}

test('unchanged row versions skip bulk audits; updates and failed revision checks reload current data',async()=>{
 const saved=Date.now,clock={now:Date.UTC(2026,9,25)},f=fixture(clock);Date.now=()=>clock.now;
 try{const first=await cachedAudit(f.pool);assert.equal(f.reads(),1);assert.equal(first.counts.accepted,1);assert.ok(!JSON.stringify(first).includes('_auditRevision'));
  clock.now+=16000;assert.strictEqual(await cachedAudit(f.pool),first);assert.equal(f.reads(),1);assert.equal(auditInventoryTag(await cachedAudit(f.pool)),auditInventoryTag(first));
  f.update();clock.now+=16000;const updated=await cachedAudit(f.pool);assert.equal(updated.counts.excluded,1);assert.equal(f.reads(),2);assert.notEqual(auditInventoryTag(updated),auditInventoryTag(first));
  f.failRevision();clock.now+=16000;await cachedAudit(f.pool);assert.equal(f.reads(),3);
 }finally{Date.now=saved;invalidateAudit(f.pool);}
});

test('a future publication crossing the current time invalidates a matching cached revision',async()=>{
 const saved=Date.now,clock={now:Date.UTC(2026,9,25)},f=fixture(clock);f.future(new Date(clock.now+30000).toISOString());Date.now=()=>clock.now;
 try{const first=await cachedAudit(f.pool);assert.equal(first.documents[0].publishedAt,null);clock.now+=31000;const next=await cachedAudit(f.pool);assert.ok(next.documents[0].publishedAt);assert.equal(f.reads(),2);}
 finally{Date.now=saved;invalidateAudit(f.pool);}
});
