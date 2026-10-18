import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeAudit} from '../classification-audit.mjs';
import {resolveClassificationResult} from '../classification-result.mjs';
const accepted={status:'accepted',method:'llm',primary:'海洋装备'};
const pending={status:'unmatched'};
const older='2026-10-17T10:00:00Z',newer='2026-10-17T11:00:00Z';
test('newer AI result wins stale collection; new content classification wins older AI',()=>{
 assert.equal(resolveClassificationResult({classification:accepted,updatedAt:newer},{classification:pending,updatedAt:older}),accepted);
 assert.equal(resolveClassificationResult({classification:accepted,updatedAt:older},{classification:pending,updatedAt:newer}),pending);
 assert.equal(resolveClassificationResult({classification:accepted,updatedAt:newer},{classification:pending,updatedAt:newer}),accepted);
});
test('manual decision survives newer automated classification',()=>{
 const manual={status:'excluded',manual:true};
 assert.equal(resolveClassificationResult({classification:manual,updatedAt:older},{classification:accepted,updatedAt:newer}),manual);
});
test('audit counts use final decision while retaining conflicting source evidence',()=>{
 const result=mergeAudit({articles:[{id:1,link:'https://example.org/a',classification:accepted,classification_updated_at:newer}],mp:[{id:'m',payload:{url:'https://example.org/a'},classification:pending,updated_at:older}]});
 assert.equal(result.mpCounts.accepted,1);
 assert.equal(result.documents[0].classificationOrigin,'articles');
 assert.equal(result.documents[0].classificationConflict,true);
 assert.equal(result.documents[0].classificationRecords.at(-1).classification,pending);
});

test('legacy equal timestamps cannot promote a different rule version',()=>{
 const old={...pending,version:'old'};const current={...accepted,version:'current'};
 assert.equal(resolveClassificationResult({classification:old,updatedAt:newer},{classification:current,updatedAt:newer}),current);
});
