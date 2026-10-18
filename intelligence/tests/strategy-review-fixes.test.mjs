import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {compute} from '../strategy/engine.mjs';
import {compute as archivedCompute} from '../strategy/engines/1.1.0.mjs';
import {buildStudy,methodCatalog} from '../strategy/service.mjs';
import {evaluationCaseRequests} from '../strategy/evaluation-case-inputs.mjs';
import {MethodAdvisor} from '../strategy/method-advisor.mjs';
import {restoreRecord,requestFrom} from '../public/strategy/state.js';
import {matrixEditor,evidenceEditor} from '../public/strategy/matrix.js';
import {wizard} from '../public/strategy/wizard.js';
import {resultView} from '../public/strategy/results.js';
const spec=JSON.parse(await fs.readFile(new URL('../strategy/specs/cases/low-carbon-route-evaluation.json',import.meta.url)));

test('WSM local sensitivity matches hand-calculated weighted sums; TOPSIS keeps its method',()=>{
 const input={matrix:[[0,0,10],[4,9,4],[10,10,0]],labels:['A','B','C'],directions:['benefit','benefit','benefit'],indicators:['X','Y','Z'].map(name=>({name,unit:'u'})),weightMethod:'equal',scan:{type:'nine-point',indicatorIndex:0}};
 const x=compute('weighted',input).result,old=archivedCompute('weighted',input).result;
 const normalized=[[0,0,1],[.4,.9,.4],[1,1,0]];
 for(const p of x.perturbations){assert.equal(p.scoring,'weighted');for(let i=0;i<3;i++)assert.ok(Math.abs(p.scores[i]-normalized[i].reduce((s,v,j)=>s+v*p.weights[j],0))<1e-12);}
 assert.notDeepEqual(x.perturbations.map(p=>p.scores),old.perturbations.map(p=>p.scores));
 assert.equal(x.scan.scoring,'weighted');
 assert.deepEqual(compute('topsis',input).result.perturbations.map(p=>p.scores),archivedCompute('topsis',input).result.perturbations.map(p=>p.scores));
});

test('archived 1.1.0 studies still reproduce their original calculation and label',()=>{
 const request=evaluationCaseRequests(spec).find(t=>t.key==='equal-check').request;
 request.methodSelection=new MethodAdvisor({methods:methodCatalog.methods}).confirm(request,{series:[]},{mode:'manual'}).methodSelection;
 const old=buildStudy({},request);old.engineVersion='1.1.0';old.calculation=archivedCompute('weighted',old.input);delete old.configHash;
 const frozen=buildStudy({},{...request,runMode:'frozen'},old);
 assert.deepEqual(frozen.calculation,old.calculation);assert.equal(frozen.engineVersion,'1.1.0');
 assert.match(resultView(frozen),/局部敏感性（TOPSIS）/);
});

test('scenario review is explicit in records, round trips and UI; actual cells cannot use it',()=>{
 const request=evaluationCaseRequests(spec).find(t=>t.key==='equal-check').request;
 request.methodSelection=new MethodAdvisor({methods:methodCatalog.methods}).confirm(request,{series:[]},{mode:'manual'}).methodSelection;
 const record=buildStudy({},request),d=restoreRecord(record);d.presentationVersionId=record.id;
 assert.equal(record.engineVersion,'1.1.1');assert.equal(record.review.constraintScope,'scenario');
 assert.equal(record.diagnostics.readiness.engineeringStatus,'not-assessed');
 assert.equal(requestFrom(d).review.constraintScope,'scenario');
 assert.match(d.configuration.baseYear,/2026/);assert.match(d.configuration.functionalUnit,/扩容/);
 assert.match(record.researchNotes.findings.join(' '),/等权/);assert.doesNotMatch(record.researchNotes.findings.join(' '),/熵权/);
 const html=matrixEditor(d);assert.match(html,/情景数值条件满足/);assert.match(html,/情景设定已复核/);assert.doesNotMatch(html,/>✓ 来源已核定</);
 assert.match(evidenceEditor(d,0,0),/我已复核情景设定及口径/);
 const catalog={...methodCatalog,assets:{series:0},tasks:{evaluation:'综合评价'},series:[],filterOptions:{topics:[],countries:[],sources:[]},scope:{},inputOptions:{}};
 d.step=1;const step1=wizard(d,catalog);assert.match(step1,/实际工程条件仍待核验/);assert.doesNotMatch(step1,/已核对禁用、安全和工程适用性等硬约束/);
 d.step=2;assert.doesNotMatch(wizard(d,catalog),/含AHP一致性/);
 assert.match(resultView(record),/局部敏感性（WSM）/);
 const invalid=structuredClone(request);invalid.input.cellEvidence[0].nature='actual';assert.throws(()=>buildStudy({},invalid),/结构化输入校验|输入校验|输入不完整|请求未通过|情景约束/);
});
