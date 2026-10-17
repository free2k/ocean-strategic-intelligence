import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {compute,ahp,seriesRows} from '../strategy/engine.mjs';
import {methodCatalog,buildStudy,StrategyRepository,recommendations,serveStrategy} from '../strategy/service.mjs';
const approx=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const matrix={matrix:[[1,9],[5,5],[9,1]],directions:['benefit','cost'],labels:['A','B','C'],indicators:[{name:'收益',unit:'万元'},{name:'成本',unit:'万元'}],weights:[.4,.6],weightMethod:'manual',judgments:[[1,2],[.5,1]]};
const rows=Array.from({length:15},(_,i)=>({period:`${2024+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`,value:100+i*10}));
const cat={series:[{id:'s',name:'真实来源序列',unit:'桶/日',rows,frequency:'月度',sourceUrl:'https://example.org/original'}],industries:[{topic:'海洋油气',name:'海洋油气',articles:3,observations:2,series:[]}],snapshotAt:'2026-01-01'};
const request={title:'测试研究',method:'growth',dataset:{kind:'series',id:'s'},confirmed:true,scope:{}};
test('catalog identifiers are unique, all 22 ready methods have deterministic execution',()=>{
 assert.equal(new Set(methodCatalog.methods.map(m=>m.id)).size,methodCatalog.methods.length);assert.equal(methodCatalog.families,19);
 for(const m of methodCatalog.methods.filter(m=>m.status==='ready')){const inputs={describe:{values:[1,2,3]},growth:{rows},cagr:{rows},trend:{rows},moving:{rows},ahp:{judgments:matrix.judgments},hhi:{values:[50,50],completeUniverse:true},gini:{values:[0,10]},pearson:{values:[1,2,3],other:[2,4,6]},spearman:{values:[1,2,2,4],other:[2,4,4,8]},npv:{cashflows:[-100,110],rate:.1},scenario:{baseline:100,shocks:[-.1,0,.1]},'network-degree':{edges:[{from:'a',to:'b',evidence:'出处'}]}};const result=compute(m.id,inputs[m.id]||(m.id==='critic'?{...matrix,matrix:[[1,9],[5,1],[9,5]]}:matrix));assert.equal(result.method,m.id);}
});
test('known answers for ranking, entropy, equal weights and constant columns',()=>{
 let r=compute('topsis',matrix).result;approx(r.ranking[0].score,1);assert.equal(r.ranking[0].label,'C');approx(r.ranking.at(-1).score,0);
 r=compute('weighted',matrix).result;approx(r.ranking[1].score,.5);
 r=compute('entropy',matrix).result;approx(r.weights[0],.5);approx(r.weights[1],.5);
 r=compute('entropy',{...matrix,matrix:[[1,4],[2,4],[3,4]]}).result;approx(r.weights[0],1);approx(r.weights[1],0);
 assert.throws(()=>compute('entropy',{...matrix,matrix:[[4,4],[4,4],[4,4]]}),/信息差异/);
 const robust=compute('rank-robustness',matrix).result;assert.equal(robust.perturbations.length,4);for(const p of robust.perturbations)assert.deepEqual(p.leaders,['C']);
});
test('AHP rejects nonreciprocal and inconsistent judgment matrices',()=>{
 const a=ahp([[1,2,4],[.5,1,2],[.25,.5,1]]);approx(a.weights[0],4/7);assert.ok(a.cr<1e-8);
 assert.throws(()=>ahp([[1,2],[2,1]]),/互反/);assert.throws(()=>ahp([[1,9,1/9],[1/9,1,9],[9,1/9,1]]),/一致性/);
});
test('time-series validates frequencies, gaps, zero bases and partial periods',()=>{
 assert.throws(()=>seriesRows({rows:[{period:'2025-13',value:1},{period:'2025-14',value:2}]}),/统计期/);
 assert.throws(()=>seriesRows({rows:[rows[0],rows[0]]}),/重复/);assert.throws(()=>seriesRows({rows:[rows[0],{period:'2025-Q1',value:2}]}),/混合/);
 const g=compute('growth',{rows}).result.rows;approx(g[12].yearChange,120);approx(g[1].periodChange,10);assert.equal(g[0].yearChange,null);
 assert.throws(()=>compute('trend',{rows:[rows[0],...rows.slice(2)]}),/连续/);assert.throws(()=>compute('moving',{rows:rows.map((r,i)=>({...r,partial:i===0}))}),/完整/);
 approx(compute('trend',{rows}).result.slope,10);approx(compute('trend',{rows}).result.rSquared,1);
 approx(compute('moving',{rows,window:3}).result.rows[2].smoothed,110);
 approx(compute('cagr',{rows:[{period:'2024',value:100},{period:'2026',value:121}]}).result.cagrPercent,10);
 assert.equal(compute('growth',{rows:[{period:'2024',value:0},{period:'2025',value:10}]}).result.rows[1].periodChange,null);
});
test('statistics and finance match hand-checked calculations; invalid assumptions rejected',()=>{
 const d=compute('describe',{values:[1,2,3]}).result;approx(d.mean,2);approx(d.sampleSD,1);
 approx(compute('npv',{cashflows:[-100,110],rate:.1}).result.npv,0);
 approx(compute('hhi',{values:[1,1],completeUniverse:true}).result.hhi10000,5000);assert.throws(()=>compute('hhi',{values:[1,1]}),/总体/);
 approx(compute('gini',{values:[0,10]}).result.gini,.5);approx(compute('pearson',{values:[1,2,3],other:[3,2,1]}).result.coefficient,-1);
 assert.throws(()=>compute('pearson',{values:[1,1,1],other:[1,2,3]}),/常数/);assert.throws(()=>compute('npv',{cashflows:[1,2],rate:-1}),/折现率/);
 assert.throws(()=>compute('weighted',{...matrix,matrix:[[1,null],[2,3]]}),/无缺失/);assert.throws(()=>compute('did',{}),/尚未接入/);
});
test('data snapshot is server-authoritative; rerun detects data revisions, checkedAt is not data change',()=>{
 const first=buildStudy(cat,{...request,input:{rows:[{period:'2000',value:999}]}});assert.equal(first.input.rows[0].value,100);
 const again=buildStudy({...cat,series:cat.series.map(s=>({...s,checkedAt:'later'}))},request,first);assert.equal(again.comparison.dataChanged,false);
 const revised=structuredClone(cat);revised.series[0].rows[0].value=90;const next=buildStudy(revised,request,first);assert.equal(next.comparison.dataChanged,true);assert.equal(first.input.rows[0].value,100);
 assert.throws(()=>buildStudy(cat,{...request,confirmed:false}),/确认/);assert.throws(()=>buildStudy(cat,{...request,method:'did'}),/尚无/);
 assert.throws(()=>buildStudy(cat,{...request,method:'weighted'}),/单一/);assert.throws(()=>buildStudy(cat,{...request,dataset:null,input:{values:[1,2]}}),/来源/);
});
test('recommendations distinguish readiness from evidence clues without pretending a matrix exists',()=>{
 const suggestions=recommendations(cat);assert.ok(suggestions.some(s=>s.method==='trend'&&s.status==='ready'));assert.ok(suggestions.some(s=>s.method==='entropy-topsis'&&s.status==='needs-data'));
 const gaps=structuredClone(cat);gaps.series[0].rows.splice(2,1);assert.ok(!recommendations(gaps).some(s=>s.method==='trend'));
});
test('research versions persist across restart; invalid IDs cannot traverse directories',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'strategy-'));try{const repo=new StrategyRepository(dir),first=buildStudy(cat,request);await repo.save(first);const restart=new StrategyRepository(dir);assert.deepEqual(await restart.get(first.id),first);assert.equal((await restart.list()).length,1);await assert.rejects(restart.get('../snapshot'),/无效/);await assert.rejects(restart.get('00000000-0000-0000-0000-000000000000'),/不存在/);}finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('authenticated router contract: catalog, execution, readback, version rerun and unsupported methods',async()=>{
 const {attachPublishedRules}=await import('../published-rules.mjs');const {getQuantCatalog}=await import('../quant-routes.mjs');
 const config=JSON.parse(await fs.readFile(new URL('../quant-preview/legacy-rules.json',import.meta.url),'utf8'));
 const raw={generatedAt:'2026-10-17',sources:[{id:'eia',name:'EIA',url:'https://example.org'}],documents:[],events:[],evidence:[],observations:[],entities:[],relations:[],assetRegistries:{},reportCatalog:[],series:[{id:'eia-offshore-crude',name:'美国海上原油产量',sourceId:'eia',country:'US',unit:'千桶/日',frequency:'月度',rows,sourceUrl:'https://example.org/eia'}]};attachPublishedRules(raw,{config});
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'strategy-api-'));try{const store={data:raw};let status,payload;const json=(_res,code,value)=>{status=code;payload=value;},res={setHeader(){}};const call=async(method,route,b)=>{const handled=await serveStrategy({method},res,new URL('http://local/api/strategy/'+route),{store,dir,serial:f=>f(),body:async()=>b,json});assert.equal(handled,true);return payload;};
 const catalog=await call('GET','catalog');assert.equal(status,200);assert.ok(catalog.series.some(s=>s.id==='eia-offshore-crude'));assert.equal(getQuantCatalog(raw,{country:'CN'}).series.length,0);
 const first=await call('POST','studies',{...request,dataset:{kind:'series',id:'eia-offshore-crude'}});assert.equal(status,201);assert.equal(first.input.rows.length,15);
 const detail=await call('GET','studies/'+first.id);assert.equal(detail.dataHash,first.dataHash);
 await call('POST','studies',{...request,dataset:{kind:'series',id:'eia-offshore-crude'},parentId:first.id});assert.equal(status,201);assert.equal(payload.comparison.dataChanged,false);
 await call('POST','studies',{...request,dataset:{kind:'series',id:'eia-offshore-crude'},scope:{country:'CN'}});assert.equal(status,400);
 await call('POST','studies',{...request,method:'trend',parentId:first.id});assert.equal(status,400);
 await call('POST','studies',{...request,method:'did'});assert.equal(status,400);
 const summary=await call('GET','catalog');assert.equal(summary.assets.savedVersions,2);assert.equal(summary.assets.savedInputs,1);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
