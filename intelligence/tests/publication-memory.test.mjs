import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {canonical,digest,prepareSnapshot} from '../research/ledger.mjs';
import {publicationInput} from '../research/publication-input.mjs';
import {attachPublishedRules} from '../published-rules.mjs';
test('streamed canonical hashes preserve existing version IDs and JSON edge cases',()=>{
 const cases=[{},[],null,0,-0,NaN,true,'🌊𠀀\ud800',['x',undefined,,Infinity],{b:2,a:1,z:undefined},{'20':'b','3':'a','01':'c','4294967295':2,'4294967294':3},new Date(),new Uint8Array([1,3])];
 for(let n=0;n<200;n++)cases.push({z:[n,{b:'🌊'.repeat(n),a:n/7}],a:{'3':n,'21':undefined,c:null},empty:[]});
 for(const value of cases)assert.equal(digest(value),createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'));
});
test('publication projection preserves snapshot ID, facts, classification and body provenance',()=>{
 const data={generatedAt:'2026-10-20',documents:[{id:'d',versionId:'v',title:'title',content:'body 🌊',industry:{status:'accepted'},evidenceAssets:[{binary:[1,2,3]}],embedding:[.1,.2],chunks:[{text:'body'}]}],sources:[],entities:[],events:[],relations:[],observations:[],evidence:[{id:'e',documentId:'d',quote:'body'}],ieaDatasets:{large:'ingestion data'}};
 attachPublishedRules(data,{id:1,config:{rules:[]},version:'published-1'});
 const projected=publicationInput(data);
 assert.equal(projected.documents[0].evidenceAssets,undefined);
 assert.equal(projected.ieaDatasets,undefined);
 assert.deepEqual(prepareSnapshot(projected,null),prepareSnapshot(data,null));
 assert.equal(data.documents[0].evidenceAssets.length,1);
});
