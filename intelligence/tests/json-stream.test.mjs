import test from 'node:test';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {jsonTextChunks} from '../json-stream.mjs';
test('streamed snapshots exactly match JSON encoding and preserve Unicode boundaries',()=>{
 const cases=[null,[],{},['🌊𠀀',undefined,,NaN],{z:1,a:'\ud800',u:undefined},new Date('2026-10-20'),Buffer.from('hello'),{'20':'b','3':'a',nested:[{text:'中文🌊'.repeat(100)}]}];
 for(const value of cases){const chunks=[...jsonTextChunks(value,5)];assert(chunks.every(c=>c.isWellFormed()));assert.equal(Buffer.concat(chunks.map(c=>Buffer.from(c))).toString(),JSON.stringify(value));}
 const cycle={};cycle.self=cycle;assert.throws(()=>[...jsonTextChunks(cycle)],/circular/);
});
test('a 240 MB serialized snapshot fits a 96 MB heap when streamed',()=>{
 const module=new URL('../json-stream.mjs',import.meta.url).href;
 const script=`import {jsonTextChunks} from ${JSON.stringify(module)};const value=Array(40).fill('abc'.repeat(2000000));let bytes=0;for(const chunk of jsonTextChunks(value))bytes+=Buffer.byteLength(chunk);console.log(bytes);`;
 const result=spawnSync(process.execPath,['--max-old-space-size=96','--input-type=module','-e',script],{encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stderr);assert(Number(result.stdout)>240000000);
});
