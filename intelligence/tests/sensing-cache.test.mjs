import test from 'node:test';
import assert from 'node:assert/strict';
import {get,invalidateSensingCache,loadSensingPayload} from '../public/sensing.js';
test('sensing cache merges equivalent queries and failures remain retryable',async()=>{
 const original=globalThis.fetch;let calls=0,fail=false;
 globalThis.fetch=async()=>{calls++;await Promise.resolve();return {ok:!fail,json:async()=>fail?{error:'unavailable'}:{list:[],documents:[],sources:[]}};};
 try{invalidateSensingCache();await Promise.all([get('api/data?topic=&country='),get('api/data')]);assert.equal(calls,1);await get('api/data');assert.equal(calls,1);invalidateSensingCache();fail=true;await assert.rejects(get('api/data'));fail=false;await get('api/data');assert.equal(calls,3);
 const paths=[];invalidateSensingCache();globalThis.fetch=async url=>{paths.push(url);return {ok:true,json:async()=>({list:[],jobs:[]})};};await loadSensingPayload('sources','',{documents:[],sources:[]});assert.deepEqual(paths.sort(),['/api/rss/sources','/api/subscriptions']);
 }finally{globalThis.fetch=original;invalidateSensingCache();}
});
