import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {Store} from '../store.mjs';
import {applyDataEdits,queryData,readDataRecord,changeData,records,mutateStoreData,periodBounds,serveInsightData} from '../insight-data.mjs';
import {availableViews} from '../quant-preview/chart-views.js';
import {optionFor} from '../quant-preview/charts.js';
const fixture=()=>({generatedAt:'2026-10-17T00:00:00Z',sources:[{id:'s',name:'原始渠道'}],documents:[{id:'d',title:'纳入文章',titleZh:'文章中文标题',sourceId:'s',publishedAt:'2026-09-01',topic:'海洋油气',industry:{status:'accepted',primary:'海洋油气'}},{id:'excluded',title:'未纳入资料',sourceId:'s',industry:{status:'excluded',primary:null}}],observations:[{id:'o',documentId:'d',name:'产量',subject:'A',rawValue:'0',unit:'桶/日',evidenceIds:['proof']}],events:[{id:'event',documentId:'d',title:'事件',countries:['CN']}],entities:[{id:'a',name:'A'},{id:'b',name:'B'}],relations:[{id:'rel',from:'a',to:'b',documentId:'d',evidenceIds:['proof'],type:'运营'}],evidence:[{id:'proof',quote:'原始证据，数值0',documentId:'d'}],series:[{id:'series',name:'统计值',unit:'桶/日',topic:'海洋油气',sourceId:'s',rows:[{period:'2026-01',value:0},{period:'2026-Q2',value:10}]}],assetRegistries:{boem:{rows:[{lease:'L1',project:'项目',status:'Active'}]}},ieaDatasets:{datasets:{book:{name:'官方工作簿',records:[{id:'official',object:'候选项目',value:0,rawValue:'0',unit:'MW',classification:{status:'unmatched',primary:null},sheet:'工作表',cell:'M2',sourceId:'s'}]}}},reportCatalog:[{url:'https://example.com/report',sourceId:'s',label:'报告'}],sourceCandidates:{candidate:{title:'线索',sourceId:'s',status:'body-unavailable'}}});
const first=(data,kind)=>queryData(data,{kind}).items[0];
const change=(data,kind,action,patch,summary=first(data,kind))=>changeData(data,{kind,key:summary.key,revision:summary.revision,action,patch,note:'已核对来源'});
test('complete details include excluded articles, official candidates and every raw collection',()=>{
 const data=fixture(),q=queryData(data,{kind:'all'});assert.equal(q.total,16);assert.equal(first(data,'official').status,'unmatched');assert.equal(queryData(data,{kind:'documents',status:'excluded'}).total,1);
 assert.deepEqual(q.kinds.map(k=>k.count),[2,1,2,1,1,1,2,1,1,1,1,1,1]);
 const detail=readDataRecord(data,'observations',first(data,'observations').key);assert.equal(detail.record.rawValue,'0');assert.equal(detail.value,'0');assert.equal(detail.evidence[0].quote,'原始证据，数值0');assert.equal(detail.context.document.title,'文章中文标题');
});
test('all thirteen categories edit, delete, restore and survive incoming originals',()=>{
 const patches={documents:{titleZh:'修订标题'},observations:{rawValue:'3'},statistics:{value:7},registries:{project:'修订项目'},official:{value:7},events:{title:'修订事件'},entities:{name:'修订实体'},relations:{type:'合作'},evidence:{quote:'修订证据'},sources:{name:'修订渠道'},series:{name:'修订序列'},reports:{label:'修订报告'},candidates:{title:'修订线索'}};
 for(const [kind,patch]of Object.entries(patches)){
  let data=fixture(),original=first(data,kind),edited=change(data,kind,'edit',patch,original);data=edited.data;
  const key=original.key,detail=readDataRecord(data,kind,key);for(const [k,v]of Object.entries(patch))assert.deepEqual(detail.record[k],v,kind+':'+k);
  const reimport=applyDataEdits(fixture(),data.insightEdits);for(const [k,v]of Object.entries(patch))assert.deepEqual(readDataRecord(reimport,kind,key).record[k],v);
  if(kind==='sources')assert.throws(()=>change(data,kind,'delete',null,detail),/仍有关联/);
  else{data=change(data,kind,'delete',null,detail).data;assert.equal([...records(data,kind)].some(r=>r.key===key),false,kind);const trash=readDataRecord(data,kind,key);assert.equal(trash.deleted,true);assert.equal(queryData(data,{kind,deleted:'true'}).items[0].key,key);assert.equal([...records(applyDataEdits(fixture(),data.insightEdits),kind)].some(r=>r.key===key),false);
   data=change(data,kind,'restore',null,trash).data;const restored=readDataRecord(data,kind,key);assert.equal(restored.deleted,false);for(const [k,v]of Object.entries(patch))assert.deepEqual(restored.record[k],v);assert.equal(restored.history.length,3);assert.equal([...records(applyDataEdits(fixture(),data.insightEdits),kind)].filter(r=>r.key===key).length,1);
  }
 }
});
test('mutation validation rejects protected fields, stale revisions, invalid numbers and invalid dates atomically',()=>{
 const data=fixture(),row=first(data,'documents'),before=JSON.stringify(data);
 for(const patch of [{id:'replacement'},{sourceId:'other'},{publishedAt:'2026-02-30'},{industry:{status:'accepted',primary:'错误行业'}}])assert.throws(()=>change(data,'documents','edit',patch,row));
 assert.throws(()=>change(data,'statistics','edit',{value:'12'}),/有效数字/);assert.throws(()=>changeData(data,{kind:'documents',key:row.key,revision:'stale',patch:{title:'x'},note:'test'}),/已发生变化/);
 assert.equal(JSON.stringify(data),before);const next=change(data,'documents','edit',{industry:{status:'accepted',primary:'海洋低碳',reason:'人工核对'}}).data;assert.equal(next.documents.find(d=>d.id===row.id).industry.manual,true);assert.equal(next.documents.find(d=>d.id===row.id).topic,'海洋低碳');
});
test('zero, negative numbers, identity and file restart persist, including across fresh imports',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'insight-data-'));try{
  await fs.writeFile(path.join(dir,'snapshot.json'),JSON.stringify(fixture()));const store=new Store(dir);await store.init();const summary=first(store.data,'statistics');await mutateStoreData(store,{...summary,action:'edit',patch:{value:-2},note:'更正统计值'},'test');
  const restarted=new Store(dir);await restarted.init();assert.equal(readDataRecord(restarted.data,'statistics',summary.key).record.value,-2);await restarted.import(fixture());assert.equal(readDataRecord(restarted.data,'statistics',summary.key).record.value,-2);assert.equal(restarted.data.observations[0].rawValue,'0');
  const old=restarted.data;restarted.persist=async()=>{throw Error('disk full');};const latest=readDataRecord(old,'statistics',summary.key);await assert.rejects(mutateStoreData(restarted,{...latest,action:'edit',patch:{value:4},note:'文件失败测试'}));assert.equal(restarted.data,old);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('time filters compare month, quarter and year intervals without inventing collection dates',()=>{
 assert.deepEqual(periodBounds('2026-Q2'),['2026-04-01','2026-06-30']);assert.deepEqual(periodBounds('2024-02'),['2024-02-01','2024-02-29']);assert.deepEqual(periodBounds('2026'),['2026-01-01','2026-12-31']);
 const data=fixture();assert.equal(queryData(data,{kind:'statistics',from:'2026-05-01',to:'2026-05-31'}).total,1);assert.equal(queryData(data,{kind:'official',from:'2026-01-01'}).total,0);assert.equal(queryData(data,{kind:'events',country:'CN'}).total,1);assert.throws(()=>queryData(data,{from:'2026-12-01',to:'2026-01-01'}),/开始日期/);
});
test('revisions ignore jsonb key order and restoring a series reapplies point corrections',()=>{
 const original=fixture(),reordered=JSON.parse(JSON.stringify(original,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).reverse()):v));
 assert.equal(first(original,'documents').revision,first(reordered,'documents').revision);
 let data=change(original,'statistics','edit',{value:-8}).data;data=change(data,'series','delete',null).data;assert.equal(queryData(data,{kind:'statistics'}).total,0);
 const series=queryData(data,{kind:'series',deleted:'true'}).items[0];data=change(data,'series','restore',null,series).data;assert.equal(queryData(data,{kind:'statistics',sort:'date'}).items[0].value,-8);
});
test('business status, classification and Chinese country filters remain distinct; unused sources can be restored',()=>{
 const data=fixture();data.sources.push({id:'unused',name:'未关联渠道'});Object.assign(data.ieaDatasets.datasets.book.records[0],{status:'Operational',statusZh:'运行中'});
 assert.equal(queryData(data,{kind:'official',status:'record:Operational'}).total,1);assert.equal(queryData(data,{kind:'official',status:'unmatched'}).total,1);assert.equal(queryData(data,{kind:'official',q:'运行中'}).total,1);assert.equal(queryData(data,{kind:'documents',country:'中国'}).total,1);
 const row=queryData(data,{kind:'sources',q:'未关联渠道'}).items[0];assert.equal(row.id,'unused');let next=change(data,'sources','delete',null,row).data;assert.equal(next.sources.some(s=>s.id==='unused'),false);next=change(next,'sources','restore',null,readDataRecord(next,'sources',row.key)).data;assert.equal(next.sources.find(s=>s.id==='unused').name,'未关联渠道');
});
test('HTTP writes are bounded, methods restricted, cross-site writes rejected, CSV uses active filters',async()=>{
 let value,code,output='',headers;const res={writeHead(c,h){code=c;headers=h;},end(s){output=s;}},store={data:fixture()},deps={store,serial:fn=>fn(),body:async()=>({}),json(r,c,v){code=c;value=v;}};
 await serveInsightData({method:'GET',headers:{}},res,new URL('http://localhost/api/insight-data?kind=documents&status=excluded'),deps);assert.equal(code,200);assert.equal(value.total,1);
 await serveInsightData({method:'POST',headers:{'sec-fetch-site':'cross-site'}},res,new URL('http://localhost/api/insight-data/record'),deps);assert.equal(code,403);
 await serveInsightData({method:'DELETE',headers:{}},res,new URL('http://localhost/api/insight-data/record'),deps);assert.equal(code,405);
 await serveInsightData({method:'GET',headers:{}},res,new URL('http://localhost/api/insight-data?kind=documents&status=excluded&format=csv'),deps);assert.equal(code,200);assert.match(headers['Content-Type'],/text\/csv/);assert.match(output,/未纳入资料/);assert.doesNotMatch(output,/文章中文标题/);
});
test('every supported real chart receives multiple truthful views and preserves numeric scales',()=>{
 const cases=[{id:'x',renderer:'series',types:['line'],unit:'MW',rows:[{period:'2026-Q1',value:0},{period:'2026-Q2',value:-2}]},{id:'calendar-2026',renderer:'calendar',types:['calendar'],year:'2026',rows:[{period:'2026-01-01'},{period:'2026-01-03'}]},{id:'count',renderer:'registry-count',unit:'条',rows:[{status:'A'},{status:'B'},{status:'A'}]},{id:'lease-year',types:['heatmap'],rows:[{effectiveYear:'2025',status:'A'},{effectiveYear:'2025',status:'B'}]},{id:'geography',types:['map'],rows:[{code:'CN',name:'中国',value:2}]},{id:'relations-x',types:['graph'],rows:[{fromName:'A',toName:'B',type:'运营',proof:[]}]},{id:'reports-宏观政策',types:['scatter'],rows:[{sourceId:'s',period:'2026-01-01',title:'a'},{sourceId:'s',period:'2026-03-01',title:'b'}]},{id:'reports-多能融合',types:['tree'],rows:[{title:'a',children:[{name:'b'}]}]},{id:'buzios-share',types:['pie'],rows:[{label:'a',value:60},{label:'b',value:40}]},{id:'ccs-plan',types:['bar'],unit:'吨/年',rows:[{label:'A',value:20}]}];
 for(const card of cases){assert.ok(availableViews(card).length>=2,card.id);for(const view of availableViews(card)){const o=optionFor({...card,title:card.id,content:''},view,[{id:'s',name:'来源'}],true);assert.ok(o.series.length,card.id+':'+view);}}
 const area=optionFor({...cases[0],title:'x'},'line',[],false),bar=optionFor({...cases[0],title:'x'},'bar',[],false);assert.deepEqual(area.series[0].data,bar.series[0].data);assert.deepEqual(bar.series[0].data,[0,-2]);
 const day=optionFor({...cases[1],title:'x'},'dailyBar',[],false);assert.deepEqual(day.series[0].data,[1,0,1]);const monthly=optionFor({...cases[6],title:'x'},'monthlyLine',[],false);assert.deepEqual(monthly.series[0].data,[1,0,1]);
});
