import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceDataServer} from '../workspace-data-server.mjs';
const snapshot={metrics:{documents:1},documents:[{id:'d',title:'原文',originalContent:'完整正文',evidenceAssets:[{text:'资产'}]}],entities:[],events:[],relations:[],observations:[{id:'zero',rawValue:'0'}],evidence:[{id:'p',quote:'完整原文证据'}],series:[],sources:[],topics:[]};
async function fixture(run){
 const calls=[];
 const server=createWorkspaceDataServer({upstream:'http://source.test',fetchImpl:async(url,options)=>{
  calls.push({url,options});return options.headers.cookie==='ocean_auth=valid'?Response.json(snapshot):Response.json({error:'请先登录'},{status:401});
 }});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await run('http://127.0.0.1:'+server.address().port,calls);}finally{await new Promise(resolve=>server.close(resolve));}
}
test('adapter forwards authorization and all filters and never accepts data writes',()=>fixture(async(base,calls)=>{
 const denied=await fetch(base+'/api/data?projection=summary');assert.equal(denied.status,401);assert.deepEqual(await denied.json(),{error:'请先登录'});
 const result=await fetch(base+'/api/data?country=CN&topic=wind&sourceId=s&from=2026-01-01&to=2026-12-31&projection=summary',{headers:{cookie:'ocean_auth=valid'}});
 assert.equal(result.status,200);const data=await result.json();assert.equal(data.scopeCounts.documents,1);
 const sent=new URL(calls.at(-1).url);for(const [key,value] of new URLSearchParams('country=CN&topic=wind&sourceId=s&from=2026-01-01&to=2026-12-31'))assert.equal(sent.searchParams.get(key),value);
 assert.equal(calls.at(-1).options.headers.cookie,'ocean_auth=valid');
 const count=calls.length;assert.equal((await fetch(base+'/api/data',{method:'POST',body:'{}'})).status,405);assert.equal(calls.length,count);
}));
test('legacy JSON and full evidence stay complete; compact reads do not mutate the source',()=>fixture(async(base)=>{
 const headers={cookie:'ocean_auth=valid'};
 assert.deepEqual(await(await fetch(base+'/api/data',{headers})).json(),snapshot);
 const full=await(await fetch(base+'/api/data?projection=full',{headers})).json();assert.deepEqual(full.evidence,snapshot.evidence);assert.deepEqual(full.observations,snapshot.observations);
 assert.equal(full.documents[0].originalContent,undefined);assert.equal(snapshot.documents[0].originalContent,'完整正文');
 assert.equal((await fetch(base+'/api/data?projection=unknown',{headers})).status,400);
}));
test('native projections retain their original scope counts after the main service restarts',async()=>{
 const native={...snapshot,projection:'summary',documents:[],scopeCounts:{documents:123,seriesRows:456}};
 const server=createWorkspaceDataServer({fetchImpl:async()=>Response.json(native)});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const data=await(await fetch('http://127.0.0.1:'+server.address().port+'/api/data?projection=summary')).json();assert.deepEqual(data,native);}finally{await new Promise(resolve=>server.close(resolve));}
});
