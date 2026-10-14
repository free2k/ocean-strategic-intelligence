import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceInput,resolveEvidence} from '../research/evidence-input.mjs';
import {reviewCandidate} from '../research/review-candidates.mjs';
test('model-selected evidence resolves exact text and version; unknown IDs cannot create evidence',()=>{
 const entry={documentId:'doc-a',bodyVersionId:'body-a',body:{title:'original',content:'A retained original quote with punctuation “unchanged”. '.repeat(30)}};
 const {documents,evidence}=evidenceInput([entry]);assert(documents[0].snippets.length>1);
 const result=resolveEvidence({items:[{id:'one',evidenceIds:['E0']}]},evidence);
 assert.equal(result.items[0].references[0].documentId,'doc-a');assert.equal(result.items[0].references[0].bodyVersionId,'body-a');assert(entry.body.content.includes(result.items[0].facts[0]));
 assert.throws(()=>resolveEvidence({items:[{evidenceIds:['INVENTED']}]},evidence),/UNKNOWN_EVIDENCE_ID/);
 assert.throws(()=>resolveEvidence({items:[{}]},evidence),/MISSING_EVIDENCE_IDS/);
});
test('partial review excludes unsupported items and replaces dependent summary, never publishes',()=>{
 const entries=[{documentId:'d',bodyVersionId:'v',body:{content:'Original project alpha is underway. Original project beta is underway.'}}];
 const item=(id,quote)=>({id,title:'Project',facts:[quote],analysis:'A project update.',gaps:'Further evidence needed.',watch:'Observe changes.',references:[{documentId:'d',bodyVersionId:'v',quote}]});
 const a=item('a','Original project alpha is underway.'),b=item('b','Original project beta is underway.'),bad={...a,id:'bad',analysis:'Growth of 999%.'};
 const result=reviewCandidate({overview:'Unverified 999% growth',items:[a,b,bad]},entries);
 assert.equal(result.status,'reviewable_partial');assert.equal(result.content.items.length,2);assert.equal(result.omitted[0].id,'bad');assert.equal(result.published,false);assert(!result.content.overview.includes('999'));
 assert.equal(reviewCandidate({items:[a,bad]},entries).status,'insufficient_validated_items');
});
