import test from 'node:test';
import assert from 'node:assert/strict';
import {splitWorkspace,hydrateWorkspace,readWorkspaceClient} from '../workspace-storage.mjs';
import {createHash} from 'node:crypto';

test('nested large objects and arrays round trip without splitting Unicode',async()=>{
 const data={generatedAt:'2026-10-20',documents:[{id:'a',content:'𠀀🌊中文'.repeat(40),assets:[1,2,3]}],nested:{items:['🌊'.repeat(40)]},empty:[]};
 const {root,parts}=splitWorkspace(data,{threshold:80,partChars:9});
 assert(root._workspaceParts.fields.documents);assert(root._workspaceParts.fields.nested);
 assert(parts.every(p=>p.payload.isWellFormed()));
 assert.deepEqual(await hydrateWorkspace(root,async(_g,f)=>parts.filter(p=>p.field===f)),data);
 assert.deepEqual(await hydrateWorkspace({legacy:true},()=>assert.fail()),{legacy:true});
});
test('missing, reordered or corrupt parts fail closed',async()=>{
 const {root,parts}=splitWorkspace({documents:[{content:'abc'.repeat(100)}]},{threshold:10,partChars:40});
 await assert.rejects(hydrateWorkspace(root,async()=>parts.slice(1)),{code:'WORKSPACE_PARTS_MISSING'});
 await assert.rejects(hydrateWorkspace(root,async()=>parts.toReversed()),{code:'WORKSPACE_PARTS_MISSING'});
 await assert.rejects(hydrateWorkspace(root,async()=>parts.map((p,i)=>i? p:{...p,payload:p.payload+'x'})),{code:'WORKSPACE_PARTS_CORRUPT'});
});
test('bounded metadata reads match streaming output, preserve versions and reject corrupt parts',async()=>{
 const metadata={datasets:{ccus:{records:[{object:'CCUS封存🙂',value:2,unit:'Mt/yr'}]}}},text=JSON.stringify(metadata),parts=[{part:0,payload:text}],hash=createHash('sha256').update(text).digest('hex');
 const root={documents:[],_workspaceParts:{version:1,generation:'g',fields:{ieaDatasets:{parts:1,sha256:hash}}}};
 let queries=0;const client={query:async(sql)=>{queries++;return {rows:sql.includes('FROM ocean_intel.runs')?[{payload:structuredClone(root),version:'v'}]:structuredClone(parts)};}};
 const data=await readWorkspaceClient(client,null,{fastMetadata:true});assert.deepEqual(data.ieaDatasets,metadata);assert.equal(await readWorkspaceClient(client,data,{fastMetadata:true}),data);assert.equal(queries,3);
 parts[0].payload+='x';await assert.rejects(readWorkspaceClient(client,null,{fastMetadata:true}),{code:'WORKSPACE_PARTS_CORRUPT'});
});
