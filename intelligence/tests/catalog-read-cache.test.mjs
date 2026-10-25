import test from 'node:test';
import assert from 'node:assert/strict';
import {readCatalog,clearCatalogReads} from '../quant-preview/catalog-read.js';
import {serveQuant} from '../quant-routes.mjs';
import {rawFixture} from './strategy-fixture.mjs';

test('chart revisits validate their version and each view receives an independent mutable copy',async()=>{
 const original=globalThis.fetch;let calls=0;clearCatalogReads();
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'/quant/api/catalog');if(calls===1)return Response.json({cards:[{selectedCohort:0}]},{headers:{ETag:'"v1"'}});assert.equal(options.headers['If-None-Match'],'"v1"');return new Response(null,{status:304});};
 try{const first=await readCatalog('/quant/api/catalog?topic=&country=');first.cards[0].selectedCohort=3;const next=await readCatalog('/quant/api/catalog?country=&topic=');assert.equal(next.cards[0].selectedCohort,0);assert.equal(calls,2);}
 finally{globalThis.fetch=original;clearCatalogReads();}
});

test('a forced chart refresh bypasses the saved version and failed reads remain retryable',async()=>{
 const original=globalThis.fetch;let calls=0;clearCatalogReads();
 globalThis.fetch=async(_url,options)=>{calls++;assert.equal(options.headers,undefined);return calls===2?Response.json({error:'unavailable'},{status:503}):Response.json({version:calls},{headers:{ETag:'"v'+calls+'"'}});};
 try{await readCatalog('/quant/api/catalog');await assert.rejects(readCatalog('/quant/api/catalog',{force:true}),/unavailable/);assert.equal((await readCatalog('/quant/api/catalog',{force:true})).version,3);}
 finally{globalThis.fetch=original;clearCatalogReads();}
});

test('catalog conditional reads invalidate on committed input or filter changes',async()=>{
 const raw=await rawFixture();Object.defineProperty(raw,'_readVersion',{value:'v1',configurable:true});
 const run=async(query='',tag)=>{const headers={},result={status:200};const res={setHeader:(k,v)=>{headers[k]=v;},writeHead:s=>{result.status=s;},end:value=>{result.body=value;}};await serveQuant({method:'GET',headers:{'if-none-match':tag}},res,new URL('/quant/api/catalog'+query,'http://localhost'),raw,'');return {...result,headers};};
 const first=await run();assert.equal(first.status,200);assert.match(first.headers.ETag,/^"catalog-[a-f0-9]+"$/);
 const same=await run('?country=&topic=',first.headers.ETag);assert.equal(same.status,304);assert.equal(same.body,undefined);
 assert.equal((await run('?country=NO',first.headers.ETag)).status,200);
 Object.defineProperty(raw,'_readVersion',{value:'v2'});assert.equal((await run('',first.headers.ETag)).status,200);
});
