import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {SensingPageCache,sensingPagePayload,attachSourceHistory,sourceRssChannels} from '../sensing-page.mjs';

const page=n=>({subscriptions:[{id:'mp:a',count:n}],rss:{list:[]},observedAt:'2026-10-26T00:00:00Z',documents:[],collection:{running:false}});

test('ready and expired source views return real content without waiting behind a slow refresh',async()=>{
 let now=100,calls=0,finish;
 const cache=new SensingPageCache({scope:'ocean',clock:()=>now,ttl:100,load:async()=>{calls++;return calls===1?page(3):new Promise(resolve=>{finish=()=>resolve(page(4));});}});
 await cache.init();assert.equal((await cache.read()).subscriptions[0].count,3);assert.equal(calls,1);
 now+=101;
 const value=await Promise.race([cache.read(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Source navigation blocked on background work')),200))]);
 assert.equal(value.subscriptions[0].count,3);assert.equal(value.sourceView.refreshing,true);assert.equal(calls,2);const pending=cache.pending;finish();await pending;
 const fresh=await cache.read();assert.equal(fresh.subscriptions[0].count,4);assert.notEqual(fresh.sourceView.version,value.sourceView.version);assert.equal(fresh.sourceView.refreshing,false);
});

test('concurrent refreshes coalesce and a failed refresh keeps the dated successful result',async()=>{
 let now=100,fail=false,calls=0;
 const cache=new SensingPageCache({scope:'ocean',clock:()=>now,ttl:10,load:async()=>{calls++;if(fail)throw Error('database unavailable');return page(7);}});
 await cache.init();fail=true;now+=20;
 const [a,b]=await Promise.all([cache.read(),cache.read()]);assert.equal(calls,2);assert.equal(a.observedAt,b.observedAt);await cache.pending?.catch(()=>{});
 const value=await cache.read();assert.equal(value.subscriptions[0].count,7);assert.ok(value.sourceView.error);assert.equal(value.observedAt,'2026-10-26T00:00:00Z');
 await cache.pending?.catch(()=>{});
});

test('restart serves the private saved view immediately while revalidating and rejects another system scope',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sensing-view-'));let finish;
 try{
  const first=new SensingPageCache({dir,scope:'ocean-db',load:async()=>page(8)});await first.init();assert.equal((await fs.stat(path.join(dir,'sensing-page.json'))).mode&0o777,0o600);
  const restarted=new SensingPageCache({dir,scope:'ocean-db',load:()=>new Promise(resolve=>{finish=()=>resolve(page(9));})});await restarted.init();assert.equal((await restarted.read()).subscriptions[0].count,8);assert.equal((await restarted.read()).sourceView.refreshing,true);const pending=restarted.pending;finish();await pending;
  const isolated=new SensingPageCache({dir,scope:'low-carbon-db',load:async()=>page(2)});await isolated.init();assert.equal((await isolated.read()).subscriptions[0].count,2);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('writes discard older in-flight results and explicit reload waits for a post-write snapshot',async()=>{
 let calls=0,finish;
 const cache=new SensingPageCache({scope:'ocean',ttl:0,load:async()=>{calls++;if(calls===2)return new Promise(resolve=>{finish=()=>resolve(page(2));});return page(calls);}});
 await cache.init();await cache.read();cache.invalidate();const forced=cache.read({force:true});finish();const result=await forced;assert.equal(result.subscriptions[0].count,3);assert.equal(calls,3);
});

test('source payload preserves classifications, bridge counts, source controls and history without article bodies',()=>{
 const data={sources:[{id:'rss',name:'RSS',method:'rss',url:'https://example.org/'}],documents:[{id:'one',sourceId:'rss',content:'PRIVATE SOURCE BODY',autoExtraction:{status:'completed'}}],events:[],observations:[],entities:[],relations:[],evidence:[],series:[],generatedAt:'2026-10-25'};
 const audit={observedAt:'2026-10-26',mpCounts:{total:3,accepted:1,excluded:1,pending:1},subscriptions:[{id:'mp:a',count:3,ready:2,latest:'2026-10-25'}],documents:[{channelGroup:'mp2rss',classification:{status:'accepted'},bodyComplete:true,synced:true}]};
 const records={subscriptions:[{id:'mp:a',enabled:true,present:true,source_id:1,payload:{name:'账号A',platform:'mp',remoteId:'123',unused:'not transferred'}}],history:[{id:1,count:5}],rss:[{id:2,method:'rss'}],jobs:[{id:1,action:'sync',request:'not transferred',result:{inserted:3,hiddenProviderResponse:'SECRET'}}]};
 const result=sensingPagePayload({data,audit,records,collection:{running:false}});assert.deepEqual(result.classification,audit.mpCounts);assert.equal(result.bridge.eligible,1);assert.equal(result.bridge.delivered,1);assert.equal(result.subscriptions[0].historyCount,5);assert.equal(result.subscriptions[0].ready,2);assert.equal(result.subscriptions[0].remoteId,'123');assert.equal(result.jobs[0].result.inserted,3);assert.equal(result.jobs[0].request,undefined);assert.ok(!JSON.stringify(result).includes('PRIVATE SOURCE BODY'));assert.ok(!JSON.stringify(result).includes('SECRET'));
 const shared=sensingPagePayload({data,audit,records:{...records,history:[]},collection:{mode:'shared'},shared:true});assert.equal(shared.rss.readOnly,true);assert.equal(shared.rss.list[0].id,'intel:rss');assert.equal(shared.rss.list[0].count,1);
});

test('history identity and RSS replacement retain the existing channel counting contracts',()=>{
 const original=[{id:'a',source_id:1,payload:{platform:'mp',name:'Ａ 账号',remoteId:'123'}},{id:'b',payload:{platform:'x',name:'Other'}}],history=[{id:1,type:'wechat',name:'旧名称',fakeid:'',count:2},{id:3,type:'wechat',name:'other',fakeid:Buffer.from('123').toString('base64'),count:4}];
 const actual=attachSourceHistory(original.map(s=>({...s,name:s.payload.name,platform:s.payload.platform,remoteId:s.payload.remoteId})),history);assert.deepEqual(actual.map(s=>s.historyCount),[6,0]);
 const list=sourceRssChannels([{id:1,name:'local',alias:'https://example.org/',count:2},{id:2,name:'duplicate',alias:'https://example.org/',count:1},{id:3,name:'retired',alias:'https://cn.todayrss.com/a',count:9}],[{id:'official',payload:{name:'Official',url:'https://example.org/',method:'rss',status:'ready'},count:5}]);assert.equal(list.length,1);assert.equal(list[0].count,5);assert.equal(list[0].localCount,3);assert.equal(list[0].id,'intel:official');
});
