import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {importXEvidence} from '../intelligence/import-x-evidence.mjs';
const empty=()=>({sources:[],documents:[],events:[],relations:[],observations:[],evidence:[],entities:[]});
test('cleaned accepted originals carry translations, thread images, dates and deduped provenance',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'x-evidence-'));
 try{const payload={url:'https://example.org/report',title:'Offshore wind report',titleZh:'海上风电报告',content:'The offshore wind facility has a planned capacity of 100 MW.',contentZh:'该海上风电设施的规划容量为100 MW。',hash:'v1',language:'en',access:'public',status:'cleaned',publishedAt:null,author:'Official agency',origins:[{postUrl:'https://x.com/i/web/status/2',rootPostUrl:'https://x.com/i/web/status/1'}],tables:[],collectedAt:'2026-10-11T00:00:00Z'};
 const row={payload,classification:{status:'accepted',primary:'海上风电',topics:['海上风电']}};
 const asset={url:'https://example.org/chart.png',status:'completed',payload:{kind:'illustration',automaticSeries:false},origins:[{postUrl:'https://x.com/i/web/status/3',rootPostUrl:'https://x.com/i/web/status/1'}]};
 const pool={query:async sql=>({rows:sql.includes('to_regclass')?[{t:'yes'}]:sql.includes('evidence_documents')?[row]:[asset]})};const data=empty();await importXEvidence(data,pool,dir);assert.equal(data.documents.length,1);const d=data.documents[0];assert.equal(d.publishedAt,null);assert.equal(d.translationVersion,d.versionId);assert.equal(d.evidenceAssets.length,1);assert.equal(d.evidenceAssets[0].automaticSeries,false);
 await importXEvidence(data,pool,dir);assert.equal(data.documents.length,1);
 row.classification={status:'excluded',primary:null};await importXEvidence(data,pool,dir);assert.equal(data.documents[0].industry.status,'excluded');assert.equal(data.documents[0].content,payload.content);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('restricted or unmatched articles are retained upstream but never promoted as accepted full texts',async()=>{const data=empty();const pool={query:async sql=>({rows:sql.includes('to_regclass')?[{t:'yes'}]:sql.includes('evidence_documents')?[{payload:{url:'https://example.org/paywall',origins:[],access:'restricted',status:'restricted'},classification:{status:'accepted',primary:'海洋油气'}}]:[]})};await importXEvidence(data,pool,'.');assert.equal(data.documents.length,0);});

test('RSS evidence does not attach unrelated images through absent post URLs',async()=>{
 const data=empty();data.documents=[{id:'existing',url:'https://oilprice.com/a.html'}];
 const row={payload:{url:'https://oilprice.com/a.html',origins:[{provider:'OilPrice RSS',articleUrl:'https://oilprice.com/a.html'}],tables:[]},classification:{status:'accepted',primary:'海洋油气'}};
 const assets=['a','b'].map(k=>({url:`https://example.org/${k}.png`,payload:{kind:'chart'},origins:[{provider:'OilPrice RSS',articleUrl:`https://oilprice.com/${k}.html`}]}));
 const pool={query:async sql=>({rows:sql.includes('to_regclass')?[{t:'yes'}]:sql.includes('evidence_documents')?[row]:assets})};
 await importXEvidence(data,pool,'.');assert.equal(data.documents[0].evidenceAssets.length,1);assert.equal(data.documents[0].evidenceAssets[0].url,'https://example.org/a.png');
});
