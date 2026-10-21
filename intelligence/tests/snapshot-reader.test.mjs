import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {snapshotEntries,readSnapshot} from '../snapshot-reader.mjs';
import {mergeProcessedSnapshot,pipelineVersion} from '../auto-extract.mjs';
import {mergeSnapshotFile} from '../merge-snapshot-stream.mjs';

test('streamed articles survive arbitrary UTF-8 boundaries, arrays and escaped braces',async()=>{
 const value={documents:[{id:'a',content:'中文😀"\\{}[]'},{id:'b',content:'next',nested:[{},[],true,null,4]}],empty:[],metadata:{items:[1,2]},flag:false,number:3,text:'x'};
 const bytes=Buffer.from(JSON.stringify(value));const chunks=Array.from(bytes,x=>Buffer.from([x]));
 const entries=[];for await(const entry of snapshotEntries(chunks))entries.push(entry);
 assert.equal(entries.filter(e=>e.field==='documents'&&!e.start).length,2);
 const dir=await mkdtemp(path.join(tmpdir(),'snapshot-reader-'));
 try{const file=path.join(dir,'snapshot.json');await writeFile(file,bytes);
  assert.deepEqual(await readSnapshot(file),value);
  const result=await readSnapshot(file,{previous:value});assert.equal(result.documents[0],value.documents[0]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('malformed or truncated files fail without publishing a partial result',async()=>{
 await assert.rejects(async()=>{for await(const entry of snapshotEntries(['{"documents":[{"id":"a"},']))void entry;});
 await assert.rejects(async()=>{for await(const entry of snapshotEntries(['[]']))void entry;});
});
test('merge does not mutate the committed article and preserves human calibration',()=>{
 const doc={id:'a',versionId:'v',autoExtraction:{versionId:'v',pipelineVersion,status:'completed'},extraction:{events:[]}};
 const reviewed={id:'e',documentId:'a',reviewedAt:'today',status:'accepted'};
 const base={documents:[doc],events:[reviewed],entities:[],relations:[],observations:[],evidence:[],sources:[]};
 const result=mergeProcessedSnapshot(base,{...base,events:[{id:'e',documentId:'a',status:'rejected'}]});
 assert.notEqual(result.documents[0],doc);assert.deepEqual(doc.extraction.events,[]);assert.equal(result.events[0],reviewed);
});
test('article stream merge matches legacy semantics even when facts precede articles',async()=>{
 const doc={id:'a',versionId:'v',extraction:{events:[]}},reviewed={id:'human',documentId:'a',reviewedAt:'today'};
 const live={documents:[doc,{id:'untouched',content:'keep'}],events:[{id:'old',documentId:'a'},reviewed],sources:[],entities:[{id:'company',evidenceIds:['before']}],evidence:[],relations:[],observations:[],series:[]};
 const staged={events:[{id:'new',documentId:'a'},{id:'human',documentId:'a',status:'bad'}],documents:[{...doc,autoExtraction:{status:'completed',versionId:'v',pipelineVersion}}],entities:[{id:'company',evidenceIds:['after']}],sources:[],evidence:[],relations:[],observations:[],series:[]};
 const dir=await mkdtemp(path.join(tmpdir(),'stream-merge-'));
 try{const file=path.join(dir,'snapshot.json');await writeFile(file,JSON.stringify(staged));
  const result=await mergeSnapshotFile(live,file);
  assert.deepEqual(result,mergeProcessedSnapshot(live,staged));assert.equal(result.documents[1],live.documents[1]);
  assert.deepEqual(doc.extraction.events,[]);assert.equal(result.events.find(e=>e.id==='human'),reviewed);
  await writeFile(file,'{"documents":[{"id":"a","content":"partial"}],');await assert.rejects(mergeSnapshotFile(live,file));assert.equal(live.documents[0],doc);
 }finally{await rm(dir,{recursive:true,force:true});}
});
