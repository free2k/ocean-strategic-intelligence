import test from 'node:test';
import assert from 'node:assert/strict';
import {get,invalidateSensingCache,loadSensingPayload} from '../public/sensing.js';

test('expired inventories revalidate their version without downloading the same records again',async()=>{
 const original=globalThis.fetch,savedNow=Date.now;let now=0,calls=0;Date.now=()=>now;
 globalThis.fetch=async(url,options)=>{calls++;if(calls===1)return Response.json({documents:[{id:'saved'}]},{headers:{ETag:'"v1"'}});assert.equal(options.headers['If-None-Match'],'"v1"');return new Response(null,{status:304});};
 try{invalidateSensingCache();const value=await get('api/classification-audit?view=inventory');now=31000;assert.strictEqual(await get('api/classification-audit?view=inventory'),value);assert.equal(calls,2);assert.strictEqual(await get('api/classification-audit?view=inventory'),value);assert.equal(calls,2);}
 finally{globalThis.fetch=original;Date.now=savedNow;invalidateSensingCache();}
});

test('a refreshed read cannot be replaced by an older in-flight response',async()=>{
 const original=globalThis.fetch;let finishOld,calls=0;
 globalThis.fetch=async()=>{calls++;if(calls===1)return new Promise(resolve=>{finishOld=()=>resolve(Response.json({version:'old'}));});return Response.json({version:'new'});};
 try{invalidateSensingCache();const old=get('api/sensing-summary');invalidateSensingCache();assert.deepEqual(await get('api/sensing-summary'),{version:'new'});finishOld();await old;assert.deepEqual(await get('api/sensing-summary'),{version:'new'});assert.equal(calls,2);}
 finally{globalThis.fetch=original;invalidateSensingCache();}
});
test('sensing cache merges equivalent queries and failures remain retryable',async()=>{
 const original=globalThis.fetch;let calls=0,fail=false;
 globalThis.fetch=async()=>{calls++;await Promise.resolve();return {ok:!fail,json:async()=>fail?{error:'unavailable'}:{list:[],documents:[],sources:[]}};};
 try{invalidateSensingCache();await Promise.all([get('api/data?topic=&country='),get('api/data')]);assert.equal(calls,1);await get('api/data');assert.equal(calls,1);invalidateSensingCache();fail=true;await assert.rejects(get('api/data'));fail=false;await get('api/data');assert.equal(calls,3);
 const paths=[];invalidateSensingCache();globalThis.fetch=async url=>{paths.push(url);return {ok:true,json:async()=>({list:[],jobs:[],documents:[],mpCounts:{}})};};await loadSensingPayload('sources','',{documents:[],sources:[]});assert.deepEqual(paths,['api/sensing-page']);
 }finally{globalThis.fetch=original;invalidateSensingCache();}
});
