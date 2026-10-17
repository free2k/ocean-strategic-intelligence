import test from 'node:test';
import assert from 'node:assert/strict';
import {translateEvidence} from '../server/integrations/x-evidence-store.mjs';
test('a failed second translation chunk resumes without calling the model for the first chunk again',async()=>{
 const saved=new Map();const db={query:async(sql,args)=>{
  if(sql.startsWith('SELECT'))return {rows:saved.has(args[0])?[{payload:saved.get(args[0])}]:[]};
  saved.set(args[0],args[1]);return {rows:[]};
 }};
 let calls=0;const ai={chat:{completions:{create:async()=>{
  calls++;if(calls===2)throw Error('network_error');
  return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({titleZh:'标题',contentZh:'译文'+calls})}}]};
 }}}};
 const make=()=>({url:'https://example.com/report',content:'x'.repeat(7000),language:'en'});
 await assert.rejects(()=>translateEvidence(make(),ai,db),/network_error/);
 assert.equal(saved.size,1);const resumed=make();await translateEvidence(resumed,ai,db);
 assert.equal(calls,3);assert.equal(resumed.contentZh,'译文1\n\n译文3');
});
