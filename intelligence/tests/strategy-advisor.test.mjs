import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {MethodAdvisor, candidateReadiness, verifyMethodSelection} from '../strategy/method-advisor.mjs';
import {methodCatalog, buildStudy, serveStrategy} from '../strategy/service.mjs';
import {taskMap, methodFits} from '../public/strategy/task-map.js';
import {rawFixture, matrixRequest} from './strategy-fixture.mjs';
import {getQuantCatalog} from '../quant-routes.mjs';
import {blankDraft, requestFrom} from '../public/strategy/state.js';
import {advisorView, prepareAdviceChoice} from '../public/strategy/advisor.js';

const methods=methodCatalog.methods, method=id=>methods.find(m=>m.id===id);
const official=()=>({title:'海上原油产量近年如何变化？比较历史基期。',taskType:'evaluation',method:'weighted',scope:{},input:{},dataset:null});
const answer=(id='growth',task='statistics',series=['eia-offshore-crude'])=>({summary:'研究产量变化，区分历史描述与未来预测',elements:{goal:'比较已观测变化',objects:['海上原油'],variables:['产量'],period:'当前范围',structure:'series'},clarifications:['核定研究期间'],candidates:[{methodId:id,taskType:task,reason:'该方法可比较同口径时间序列的历史基期。',requiredData:['同口径产量序列与单位'],seriesIds:series}]});
function model(raw=answer()) {let calls=0,request;return {get calls(){return calls;},get request(){return request;},chat:{completions:{async create(input){calls++;request=input;return {id:'local-engineering-request',model:'mock-model',choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw)}}]};}}}};}
const advisor=client=>new MethodAdvisor({client,model:client?'engineering-mock':'',methods});

test('AI interprets the question beyond declared task, with real catalog IDs and independent readiness',async()=>{
  const c=getQuantCatalog(await rawFixture()),r=official(),client=model(),a=advisor(client),out=await a.analyze(r,c);
  assert.equal(out.mode,'ai');assert.equal(out.candidates[0].taskType,'statistics');
  assert.equal(r.taskType,'evaluation');assert.equal(out.candidates[0].status,'needs-confirmation');
  assert.equal(out.candidates[0].canExecute,false);assert.equal(out.candidates[0].canRunAfterReview,true);
  assert.equal(out.candidates[0].series[0].id,c.series[0].id);
  const prompt=JSON.parse(client.request.messages[1].content);
  assert.equal(prompt.context.availableData.series[0].count,15);
  assert.equal(prompt.context.availableData.series[0].rows,undefined);
  assert.equal(client.request.temperature,0);
});

test('concurrent and repeated unchanged analyses share one model completion',async()=>{
  const c=getQuantCatalog(await rawFixture()),r=official(),client=model(),a=advisor(client);
  const [x,y]=await Promise.all([a.analyze(r,c),a.analyze(r,c)]);
  assert.equal(x.id,y.id);assert.equal(client.calls,1);
  assert.equal((await a.analyze(r,c)).cached,true);assert.equal(client.calls,1);
  await a.analyze(r,c,{force:true});assert.equal(client.calls,2);
});

test('malformed task data is rejected before a model call',async()=>{
  const c=getQuantCatalog(await rawFixture()),client=model(),a=advisor(client);
  for(const r of [{...official(),input:{indicators:{name:'bad'}}},{...official(),configuration:{functionalUnit:{invalid:true}}},{...official(),taskType:['statistics']},{...official(),input:{matrix:[null]}}]) await assert.rejects(a.analyze(r,c));
  assert.equal(client.calls,0);
});

test('invented methods or sources and model failures become explicitly labelled rule advice',async()=>{
  const c=getQuantCatalog(await rawFixture());
  for(const raw of [answer('invented'),answer('growth','statistics',['made-up-source']),{...answer(),candidates:[{...answer().candidates[0],taskType:'causal'}]}]) {
    const out=await advisor(model(raw)).analyze({...official(),taskType:'statistics'},c);
    assert.equal(out.mode,'rules');assert.match(out.notice,/AI本次未完成/);
    assert.ok(out.candidates.every(x=>methods.some(m=>m.id===x.methodId)));
  }
  const out=await advisor(null).analyze(official(),c);
  assert.equal(out.mode,'rules');assert.match(out.notice,/未启用/);
});

test('an AI assertion cannot enable a planned engine or upgrade incomplete data',async()=>{
  const raw=await rawFixture(),c=getQuantCatalog(raw),suggestion=answer('milp','optimization',[]);
  suggestion.candidates[0].canExecute=true;suggestion.candidates[0].engineStatus='accepted';
  const out=await advisor(model(suggestion)).analyze(official(),c);
  assert.equal(out.candidates[0].engineStatus,'planned');assert.equal(out.candidates[0].canRunAfterReview,false);
  const s=c.series[0], incomplete={...c,series:[{...s,rows:s.rows.map((r,i)=>({...r,partial:i===0}))}]};
  const ready=candidateReadiness({...official(),dataset:{kind:'series',id:s.id}},incomplete,method('trend'));
  assert.equal(ready.dataStatus,'needs-data');assert.ok(ready.gaps.some(g=>g.includes('完整')));
});

test('AI advice cannot change hard constraints or create observations from articles',async()=>{
  const c=getQuantCatalog(await rawFixture()),r={...matrixRequest(),constraints:[{id:'hard',status:'fail',reason:'结构安全冲突'}]};
  const out=await advisor(model(answer('topsis','evaluation',[]))).analyze(r,c);
  assert.equal(out.candidates[0].status,'not-applicable');assert.equal(out.candidates[0].canRunAfterReview,false);
  const empty=await advisor(model(answer('topsis','evaluation',[]))).analyze(official(),c);
  assert.equal(empty.candidates[0].dataStatus,'needs-data');
});

test('explicit method confirmation is required before execution in the new workflow',async()=>{
  const c=getQuantCatalog(await rawFixture()),a=advisor(model()),out=await a.analyze(official(),c);
  const r={...official(),method:'growth',taskType:'statistics',dataset:{kind:'series',id:'eia-offshore-crude'},input:{window:3},confirmed:true,methodSelectionRequired:true};
  assert.throws(()=>buildStudy(c,r),e=>e.code==='METHOD_CONFIRMATION_REQUIRED');
  const confirmation=a.confirm(r,c,{mode:'ai',adviceId:out.id});
  assert.equal(confirmation.saved,false);assert.equal(confirmation.canExecute,false);
  const saved=buildStudy(c,{...r,methodSelection:confirmation.methodSelection});
  assert.equal(saved.methodSelection.mode,'ai-assisted');assert.equal(saved.input.rows[0].value,100);
  assert.equal(saved.methodSelection.token,undefined);assert.ok(saved.methodSelection.interpretation.summary);
  assert.equal(clientCount(a),1);
  const frozen=buildStudy({}, {...r,runMode:'frozen'}, saved);
  assert.deepEqual(frozen.calculation,saved.calculation);assert.deepEqual(frozen.methodSelection,saved.methodSelection);
});
function clientCount(a){return a.client.calls;}

test('confirmation binds exact question, input, method, scope and actual source revision',async()=>{
  const c=getQuantCatalog(await rawFixture()),a=advisor(null),r={...matrixRequest(),methodSelectionRequired:true};
  const selection=a.confirm(r,c,{mode:'manual'}).methodSelection;
  assert.equal(verifyMethodSelection({...r,methodSelection:selection},c).mode,'manual');
  for(const changed of [{title:'另一个研究问题'},{method:'weighted'},{scope:{topic:'其他领域'}},{input:{...r.input,matrix:[[2,9],[5,5],[9,1]]}}]) assert.throws(()=>verifyMethodSelection({...r,...changed,methodSelection:selection},c),e=>e.code==='METHOD_CONFIRMATION_STALE');
  assert.throws(()=>verifyMethodSelection({...r,methodSelection:{token:selection.token+'x'}},c),e=>e.code==='METHOD_CONFIRMATION_REQUIRED');
  const q={...official(),method:'growth',taskType:'statistics',dataset:{kind:'series',id:c.series[0].id},input:{window:3}};
  const token=a.confirm(q,c,{mode:'manual'}).methodSelection;
  const revised=structuredClone(c);revised.series[0].rows[0].value=999;
  assert.throws(()=>verifyMethodSelection({...q,methodSelection:token},revised),e=>e.code==='METHOD_CONFIRMATION_STALE');
});

test('scope changes require new AI interpretation; unsupported methods remain plan-only',async()=>{
  const c=getQuantCatalog(await rawFixture()),a=advisor(model(answer('milp','optimization',[]))),out=await a.analyze(official(),c);
  const r={...official(),method:'milp',taskType:'optimization'};
  assert.throws(()=>a.confirm({...r,scope:{country:'NO'}},c,{mode:'ai',adviceId:out.id}),e=>e.code==='ADVICE_STALE');
  const confirmation=a.confirm(r,c,{mode:'ai',adviceId:out.id});
  assert.equal(confirmation.readiness.engineStatus,'planned');
  assert.throws(()=>buildStudy(c,{...r,provenance:matrixRequest().provenance,confirmed:true,methodSelection:confirmation.methodSelection}),e=>e.code==='ENGINE_UNAVAILABLE');
});

test('all registered methods have one coherent task mapping across UI and server',()=>{
  const ids=Object.values(taskMap).flat();assert.equal(ids.length,methods.length);
  assert.equal(new Set(ids).size,methods.length);
  assert.ok(methods.every(m=>ids.includes(m.id)));assert.equal(methodFits('regression','ols'),true);
  assert.equal(methodFits('forecast','trend'),false);
});

test('advice rendering escapes model text and adoption preserves original data until explicit action',()=>{
  const d=blankDraft(),raw=answer();raw.summary='<script>unsafe</script>';
  d.title='研究问题';const before=JSON.stringify(d.matrix);
  const candidate={methodId:'growth',taskType:'statistics',requiredData:['原始数据'],gaps:[]};
  const next=prepareAdviceChoice(d,candidate,'eia-offshore-crude');
  assert.equal(d.datasetId,'');assert.equal(next.datasetId,'eia-offshore-crude');assert.equal(JSON.stringify(d.matrix),before);
  const c={methods,tasks:{evaluation:'评价'},assets:{series:0}};
  d.methodAdvice={result:{...raw,mode:'ai',candidates:[],clarifications:[]}};
  const html=advisorView(d,c);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>unsafe/);
});

test('advice endpoints return no saved study and strict confirmation gates the compute endpoint',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'strategy-advice-api-')),store={data:await rawFixture()},client=model();
  const call=async(route,body)=>{let response;await serveStrategy({method:'POST'},{setHeader(){}},new URL('http://local/api/strategy/'+route),{store,dir,client,model:'engineering-mock',serial:fn=>fn(),body:async()=>body,json:(_,status,data)=>response={status,data}});return response;};
  try {
    const analysis=await call('advice',official());assert.equal(analysis.status,200);
    const r={...official(),method:'growth',taskType:'statistics',dataset:{kind:'series',id:'eia-offshore-crude'},input:{window:3},confirmed:true,methodSelectionRequired:true};
    const failed=await call('studies',r);assert.equal(failed.status,409);
    assert.equal((await fs.readdir(path.join(dir,'strategy-research')).catch(e=>{if(e.code==='ENOENT')return [];throw e;})).filter(x=>!x.startsWith('_')).length,0);
    const confirmed=await call('advice/confirm',{...r,confirmation:{mode:'ai',adviceId:analysis.data.id}});assert.equal(confirmed.status,200);
    const saved=await call('studies',{...r,methodSelection:confirmed.data.methodSelection,requestId:'method-advisor-unit-test-1'});
    assert.equal(saved.status,201);assert.equal(saved.data.methodSelection.mode,'ai-assisted');
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
