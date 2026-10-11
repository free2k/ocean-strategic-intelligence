import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEia,mergeEia} from '../eia.mjs';
const item = {period:'2026-07',series:'MCRFP3FM2',units:'MBBL/D',value:'2043'};
const payload = rows=>({response:{frequency:'monthly',total:rows.length,data:rows}});
test('EIA orders dates without replacing missing observations with zero',()=>{
  const s=normalizeEia(payload([item,{...item,period:'2026-06',value:null},{...item,period:'2026-05',value:'1958'}]));
  assert.deepEqual(s.rows.map(r=>r.period),['2026-05','2026-07']);
  assert.equal(s.rows[1].value,2043);
});
test('EIA rejects wrong units, incomplete responses and duplicate periods',()=>{
  assert.throws(()=>normalizeEia(payload([{...item,units:'BBL'}])));
  const p=payload([item]);p.response.total=20;assert.throws(()=>normalizeEia(p));
  assert.throws(()=>normalizeEia(payload([item,item])));
});
test('EIA revision merge preserves other series and documents',()=>{
  const data={documents:[{id:'manual'}],series:[{id:'other'},{id:'eia-offshore-crude',rows:[]}],sources:[{id:'other'},{id:'eia'}]};
  const s=normalizeEia(payload([item]));const result=mergeEia(mergeEia(data,s),s);
  assert.equal(result.series.length,2);assert.equal(result.sources.length,2);
  assert.deepEqual(result.documents,data.documents);assert.equal(data.series[1].rows.length,0);
});
