import test from 'node:test';import assert from 'node:assert/strict';
import {mergeAudit,articleKey} from '../classification-audit.mjs';
import {auditMetrics} from '../audit-metrics.mjs';
test('external originals include excluded and pending before working import; URL fragments dedupe but query identities remain',()=>{
 const d=mergeAudit({working:[{id:'w',url:'https://example.com/a',industry:{status:'accepted'}}],evidence:[{url:'https://EXAMPLE.com:443/a#fragment',payload:{title:'same'},classification:{status:'accepted'}},{url:'https://example.com/b',payload:{},classification:{status:'excluded',negative:['job']}},{url:'https://example.com/b?id=2',payload:{},classification:{status:'unmatched'}}]});
 assert.deepEqual(d.counts,{total:3,accepted:1,excluded:1,pending:1});assert.equal(d.coverage.evidence,3);assert.equal(d.documents.find(x=>x.workingId).auditEvidenceUrl,'https://EXAMPLE.com:443/a#fragment');assert.notEqual(articleKey('https://x/a?id=1'),articleKey('https://x/a?id=2'));
});
test('manual classifications cannot be overwritten by collection copies and conflicts are inspectable',()=>{
 const d=mergeAudit({articles:[{id:1,link:'https://x/a',manual_classify:true,filter_status:'rejected',reject_reason:'人工排除'}],mp:[{id:'m',subscription_id:'s',payload:{url:'https://x/a'},classification:{status:'accepted'}}]});
 assert.deepEqual(d.counts,{total:1,accepted:0,excluded:1,pending:0});assert.deepEqual(d.counts,d.mpCounts);assert.equal(d.documents[0].classification.reason,'人工排除');assert.equal(d.documents[0].classificationOrigin,'articles');assert.equal(d.documents[0].classificationConflict,true);assert.equal(d.documents[0].classificationRecords.length,2);
});
test('homepage and categories reconcile on the same inventory including unmarked regions and missing primary',()=>{
 const a=mergeAudit({articles:[{id:1,link:'a',filter_status:'accepted',matched_topic:'海洋油气',is_overseas:false},{id:2,link:'b',filter_status:'rejected',is_overseas:true}],working:[{id:'w',url:'c',industry:{status:'accepted'}}]});const m=auditMetrics(a);
 assert.equal(m.totalArticles,a.counts.total);assert.equal(Object.values(m.categories).flat().reduce((n,t)=>n+t.count,0),a.counts.accepted);assert.equal(m.categories.unknown[0].count,1);
});
