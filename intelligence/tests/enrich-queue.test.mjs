import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPending} from '../enrich.mjs';
test('Unlimited enrichment includes backlog beyond eight and skips completed/manual documents',()=>{
 const docs=Array.from({length:27},(_,id)=>({id,language:'en',versionId:'v'}));
 docs.push({manual:true},{language:'en',versionId:'v',translationVersion:'v',embedding:[1]});
 assert.equal(selectPending(docs).length,27);
 assert.equal(selectPending(docs,20).length,20);
 assert.throws(()=>selectPending(docs,-1));
 assert.throws(()=>selectPending(docs,NaN));
});
