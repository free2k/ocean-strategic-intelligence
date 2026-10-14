import test from 'node:test';import assert from 'node:assert/strict';
import {recordReview,reviewMatches} from '../research/semantic-review.mjs';
test('semantic review covers every item, rejects duplicates, and is invalidated by content edits',()=>{
 const c={overview:'A',watch:'B',items:[{id:'a'},{id:'b'}]},response={summarySupported:true,summaryReason:'supported',items:[{id:'a',supported:true,reason:'supported'},{id:'b',supported:true,reason:'supported'}],duplicateGroups:[]},meta={model:'fixture',requestId:'review-1'};
 const review=recordReview(c,response,meta);assert(reviewMatches(c,review));assert(!reviewMatches({...c,overview:'changed'},review));assert(!reviewMatches(c,{...review,requestId:null}));
 assert.equal(recordReview(c,{...response,duplicateGroups:[['a','b']]},meta).status,'rejected');assert.equal(recordReview(c,{...response,summarySupported:false},meta).status,'rejected');
 assert.throws(()=>recordReview(c,{...response,items:[response.items[0],response.items[0]]},meta));assert.throws(()=>recordReview(c,{...response,items:[]},meta));
});
