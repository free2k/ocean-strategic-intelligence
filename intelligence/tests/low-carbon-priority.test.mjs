import test from 'node:test';
import assert from 'node:assert/strict';
import {prioritizeLowCarbonRecords} from '../low-carbon/priority.mjs';
test('large reclassification scans each article once and keeps stable accepted-first ordering',async()=>{
 const rows=Array.from({length:500},(_,id)=>({id,status:id%3===0?'accepted':id%3===1?'excluded':'unmatched'})),seen=new Map();let yielded=false;
 setImmediate(()=>{yielded=true;});
 const result=await prioritizeLowCarbonRecords(rows,r=>{seen.set(r.id,(seen.get(r.id)||0)+1);return {status:r.status};});
 assert.equal(seen.size,rows.length);assert.ok([...seen.values()].every(n=>n===1));assert.ok(yielded);assert.equal(result.decisions.size,rows.length);
 assert.deepEqual(result.ordered,[...rows.filter(r=>r.status==='accepted'),...rows.filter(r=>r.status!=='accepted')]);assert.deepEqual(rows.map(r=>r.id),Array.from({length:500},(_,i)=>i));
});
