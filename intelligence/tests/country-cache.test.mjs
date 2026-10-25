import test from 'node:test';import assert from 'node:assert/strict';import {loadCountryPayload,clearCountryCache} from '../public/country-dossier.js';
test('country reads coalesce matching scopes, isolate filters, and retry failures',async()=>{
 const original=globalThis.fetch;let calls=0,fail=false;
 globalThis.fetch=async url=>{calls++;await Promise.resolve();return Response.json(fail?{message:'failed'}:{url},{status:fail?503:200})};
 try{clearCountryCache();const [a,b]=await Promise.all([loadCountryPayload('countryCodes=&relationMode=external'),loadCountryPayload('relationMode=external')]);assert.equal(calls,1);assert.deepEqual(a,b);assert.match(a.url,/view=overview/);await loadCountryPayload('relationMode=external');assert.equal(calls,1);await loadCountryPayload('countryCodes=GB&relationMode=external');assert.equal(calls,2);clearCountryCache();fail=true;await assert.rejects(loadCountryPayload(''),/failed/);fail=false;await loadCountryPayload('');assert.equal(calls,4);}finally{globalThis.fetch=original;clearCountryCache();}
});

test('expired country navigation displays its dated view immediately while conditionally revalidating',async()=>{
 const original=globalThis.fetch,clock=Date.now;let now=clock(),resolve,calls=0,conditional;Date.now=()=>now;
 globalThis.fetch=async(url,options)=>{calls++;conditional=options?.headers?.['If-None-Match'];if(calls===1)return Response.json({data:{events:[]},meta:{releaseId:'saved'}},{headers:{ETag:'"saved"'}});return new Promise(r=>resolve=()=>r(new Response(null,{status:304,headers:{ETag:'"saved"'}})));};
 try{clearCountryCache();const first=await loadCountryPayload();now+=31000;const stale=await loadCountryPayload();assert.equal(stale.meta.releaseId,'saved');assert.equal(stale.dashboardView.refreshing,true);assert.equal(conditional,'"saved"');resolve();await new Promise(r=>setImmediate(r));assert.deepEqual(await loadCountryPayload(),first);assert.equal(calls,2);}finally{Date.now=clock;globalThis.fetch=original;clearCountryCache();}
});
