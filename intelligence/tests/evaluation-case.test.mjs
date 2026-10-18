import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {evaluationCaseRequests} from '../strategy/evaluation-case-inputs.mjs';
import {buildStudy,methodCatalog} from '../strategy/service.mjs';
import {MethodAdvisor} from '../strategy/method-advisor.mjs';
import {caseAnswers} from '../strategy/case-answers.mjs';
import {caseOverview} from '../public/strategy/case-view.js';
import {workflowMaterial} from '../public/strategy/case-workflow.js';
import {restoreRecord,requestFrom} from '../public/strategy/state.js';
import {discoveryView,discoveryState} from '../public/strategy/discovery.js';
const spec=JSON.parse(await fs.readFile(new URL('../strategy/specs/cases/low-carbon-route-evaluation.json',import.meta.url)));

test('evaluation case uses evidence-labelled scenario cells, real engines and immutable scenario lineage',()=>{
 const records={},advisor=new MethodAdvisor({methods:methodCatalog.methods}),catalog={series:[]};
 for(const task of evaluationCaseRequests(spec)){
  const request=task.request,parent=records[task.parentKey];
  if(parent){request.parentId=parent.id;request.studyId=parent.studyId;}
  request.methodSelection=advisor.confirm(request,catalog,{mode:'manual'}).methodSelection;
  records[task.key]=buildStudy(catalog,request,parent);
  assert.equal(request.input.cellEvidence.length,15);
  assert.ok(request.input.cellEvidence.every(e=>e.nature==='demo'&&e.sourceRef.includes('无企业原表依据')));
  assert.ok(Math.abs(records[task.key].calculation.result.weights.reduce((a,b)=>a+b)-1)<1e-10);
  assert.equal(records[task.key].calculation.result.scan.points.length,9);
 }
 const base=records['entropy-base'],updated=records['entropy-schedule'];
 assert.equal(updated.comparison.inputDifferences.length,2);
 assert.equal(updated.comparison.resultComparable,true);
 assert.equal(updated.parentId,base.id);
 assert.deepEqual(base.input.matrix,spec.evaluation.matrix);
 assert.notEqual(base.calculation.result.ranking[0].label,updated.calculation.result.ranking[0].label);
 assert.match(updated.researchNotes.findings.join(' '),/熵权/);
 assert.notEqual(records['equal-check'].studyId,base.studyId);
 const draft=restoreRecord(base);draft.presentationVersionId=base.id;
 assert.deepEqual(requestFrom(draft).input.matrix,base.input.matrix);
 const c={...spec,sources:spec.sources.map(s=>({...s,verification:'matched'})),tasks:spec.tasks.map(t=>({...t,versionId:records[t.key].id,record:records[t.key]}))};
 for(let step=0;step<4;step++){draft.step=step;const html=workflowMaterial(c,draft,base);assert.ok(html.includes('data-case-step-material'));assert.ok(!html.includes('净现金贡献'));}
 const html=caseOverview(c);assert.match(html,/逐格标为研究情景/);assert.match(html,/熵权 TOPSIS/);
 const answers=caseAnswers(c);assert.equal(answers.length,3);assert.ok(answers.every(r=>r.generated===false&&r.references.length===6));assert.match(answers[1].answer,/条件性排序/);
 const bad=structuredClone(spec);bad.evaluation.matrix[0][3]=100000;assert.throws(()=>evaluationCaseRequests(bad),/约束冲突/);
});

test('data-driven opportunity exposes its case without promoting original data readiness',()=>{
 const classification={directionId:'decision',industryIds:['海洋低碳'],taskTypes:['evaluation'],reason:'test'};
 const rec={id:'matrix:海洋低碳',title:'海洋低碳：技术路线／项目综合评价',method:'entropy-topsis',taskType:'evaluation',status:'needs-data',engineStatus:'accepted',classification};
 const c={recommendations:[rec],templates:[],caseStudies:[{id:spec.id,recommendationId:spec.recommendationId}],tasks:{evaluation:'评价'},discovery:{opportunities:[{id:rec.id,title:rec.title,actions:[rec.id],classification}],directions:[{id:'decision',name:'方案评价'}],industries:[{id:'海洋低碳',name:'海洋低碳'}],counts:{opportunities:1,themes:0},policy:''}};
 const html=discoveryView(c,discoveryState({}));assert.match(html,/查看已预填的综合评价研究/);assert.match(html,/需要补数据/);assert.equal(rec.status,'needs-data');
});
