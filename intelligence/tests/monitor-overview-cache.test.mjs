import test from 'node:test';import assert from 'node:assert/strict';
import {mountMonitorOverview} from '../public/monitor-overview.js';
test('changing objects reuses the same release summary and a failed read can retry',async t=>{
 const saved={fetch:globalThis.fetch,matchMedia:globalThis.matchMedia};t.after(()=>Object.assign(globalThis,saved));globalThis.matchMedia=()=>({matches:true});
 let calls=0,fail=false;globalThis.fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,5));return fail?new Response('<html>gateway</html>',{status:504}):Response.json({data:{kind:'processed_batch',documents:2,objects:1,affectedDocuments:1,affectedObjects:1,comparisonCount:0,comparisons:[],assessments:[]}});};
 const box={innerHTML:'',textContent:''},host=()=>({innerHTML:'',querySelector:()=>box,querySelectorAll:()=>[],addEventListener(){},insertAdjacentHTML(){}}),view=mountMonitorOverview(host(),host(),{query:'releaseId=r'});t.after(()=>view.dispose());
 view.set({meta:{releaseId:'r'}});view.set({meta:{releaseId:'r'}});await new Promise(r=>setTimeout(r,20));assert.equal(calls,1);view.set({meta:{releaseId:'r'}});await new Promise(r=>setTimeout(r,10));assert.equal(calls,1);
 fail=true;view.set({meta:{releaseId:'next'}});await new Promise(r=>setTimeout(r,20));assert.match(box.textContent,/超时/);fail=false;view.set({meta:{releaseId:'next'}});await new Promise(r=>setTimeout(r,20));assert.equal(calls,3);
});
