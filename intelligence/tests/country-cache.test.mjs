import test from 'node:test';import assert from 'node:assert/strict';import {loadCountryPayload,clearCountryCache} from '../public/country-dossier.js';
test('country reads coalesce matching scopes, isolate filters, and retry failures',async()=>{
 const original=globalThis.fetch;let calls=0,fail=false;
 globalThis.fetch=async url=>{calls++;await Promise.resolve();return Response.json(fail?{message:'failed'}:{url},{status:fail?503:200})};
 try{clearCountryCache();const [a,b]=await Promise.all([loadCountryPayload('countryCodes=&relationMode=external'),loadCountryPayload('relationMode=external')]);assert.equal(calls,1);assert.deepEqual(a,b);assert.match(a.url,/view=overview/);await loadCountryPayload('relationMode=external');assert.equal(calls,1);await loadCountryPayload('countryCodes=GB&relationMode=external');assert.equal(calls,2);clearCountryCache();fail=true;await assert.rejects(loadCountryPayload(''),/failed/);fail=false;await loadCountryPayload('');assert.equal(calls,4);}finally{globalThis.fetch=original;clearCountryCache();}
});
