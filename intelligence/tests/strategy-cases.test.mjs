import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {caseRequests} from '../strategy/case-inputs.mjs';
import {buildStudy, methodCatalog} from '../strategy/service.mjs';
import {MethodAdvisor} from '../strategy/method-advisor.mjs';
import {StrategyRepository} from '../strategy/repository.mjs';
import {readCase, listCases} from '../strategy/cases.mjs';
import {caseOverview} from '../public/strategy/case-view.js';
import {templateReadiness} from '../strategy/governance.mjs';
import {caseAnswers,publishCaseAnswers} from '../strategy/case-answers.mjs';
import {restoreRecord,requestFrom} from '../public/strategy/state.js';
import {workflowMaterial} from '../public/strategy/case-workflow.js';

const spec = JSON.parse(await fs.readFile(new URL('../strategy/specs/cases/northern-lights-ccus.json', import.meta.url)));
const catalog = {snapshotAt: '2026-10-18', series: []};

test('case uses existing engines with explicit scenario limits and a common investment horizon', () => {
  const advisor = new MethodAdvisor({methods: methodCatalog.methods});
  const records = {};
  for (const task of caseRequests(spec)) {
    const request = task.request, parent = records[task.parentKey];
    if (parent) Object.assign(request, {parentId: parent.id, studyId: parent.studyId});
    request.methodSelection = advisor.confirm(request, catalog, {mode: 'manual'}).methodSelection;
    records[task.key] = buildStudy(catalog, request, parent);
    assert.equal(records[task.key].methodSelection.mode, 'manual');
    assert.equal(records[task.key].templateId, 'TH08');
  }
  assert.deepEqual(records.volume.calculation.result.scenarios.map(s => s.value), [100000, 150000, 200000]);
  assert.equal(records.network.calculation.result.nodes, 5);
  assert.equal(records.network.calculation.result.edges, 4);
  const base = records['npv-base'], rate = records['npv-rate'], delay = records['npv-delay'];
  assert.deepEqual(base.input.cashflows, rate.input.cashflows);
  assert.equal(base.input.cashflows.length, delay.input.cashflows.length);
  assert.equal(base.input.cashflows[0], delay.input.cashflows[0]);
  assert.equal(base.input.cashflows.reduce((a, b) => a+b), delay.input.cashflows.reduce((a, b) => a+b));
  assert.ok(base.calculation.result.npv > 0);
  assert.ok(rate.calculation.result.npv < 0);
  assert.ok(delay.calculation.result.npv < 0);
  assert.equal(rate.comparison.numericChanged, false);
  assert.equal(rate.comparison.configChanged, true);
  assert.equal(delay.comparison.numericChanged, true);
  assert.equal(delay.comparison.resultComparable, true);
  assert.equal(rate.studyId, base.studyId);
  assert.match(base.provenance.reason, /纯情景参数/);
  assert.match(base.title,/海上CCUS源汇匹配与投资时序/);
  assert.ok(base.researchNotes.findings.length);
  const draft=restoreRecord(base);
  assert.deepEqual(requestFrom(draft).researchNotes,base.researchNotes);
  assert.equal(requestFrom(draft).configuration.period,base.configuration.period);
  const caseDetail={...spec,tasks:spec.tasks.map(t=>({...t,versionId:records[t.key].id,record:records[t.key]}))};
  draft.presentationVersionId=base.id;
  for(let step=0;step<4;step++){draft.step=step;assert.match(workflowMaterial(caseDetail,draft,base),new RegExp('data-case-step-material="'+step+'"'));}
  const answers=caseAnswers(caseDetail);
  assert.equal(answers.length,3);
  assert.ok(answers.every(r=>r.generated===false&&r.answer.includes('](')&&r.references.length===6));
  assert.match(answers[1].answer,/368\.07/);
  const readiness = templateReadiness({seriesTopics: [], dataRequirements: 'source/sink and MILP'}, catalog);
  assert.equal(readiness.dataStatus, 'needs-data');
  assert.equal(readiness.canExecute, false);
});

test('case answers persist as labelled evidence-based research and repeat publication is idempotent',async()=>{
  const advisor=new MethodAdvisor({methods:methodCatalog.methods}),records={};
  for(const t of caseRequests(spec)){const r=t.request,parent=records[t.parentKey];if(parent){r.parentId=parent.id;r.studyId=parent.studyId;}r.methodSelection=advisor.confirm(r,catalog,{mode:'manual'}).methodSelection;records[t.key]=buildStudy(catalog,r,parent);}
  const c={...spec,evidenceStatus:'matched',tasks:spec.tasks.map(t=>({...t,versionId:records[t.key].id,record:records[t.key]}))};
  const saved=new Map();let writes=0;
  const store={researchByIds:async ids=>ids.map(id=>saved.get(id)).filter(Boolean),saveResearch:async r=>{writes++;saved.set(r.id,r);}};
  const first=await publishCaseAnswers(c,store),second=await publishCaseAnswers(c,store);
  assert.equal(writes,3);assert.deepEqual(second,first);
  assert.ok(first.every(r=>r.mode.includes('非AI生成')&&r.caseId===c.id));
  await assert.rejects(publishCaseAnswers({...c,evidenceStatus:'needs-review'},store),/来源已变化/);
});

test('published cases bind real saved versions and report source changes without modifying records', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'strategy-cases-'));
  t.after(() => fs.rm(dir, {recursive: true, force: true}));
  const repo = new StrategyRepository(dir), published = structuredClone(spec);
  const store = {data: {documents: spec.sources.map(s => ({id: s.documentId, url: s.url, content: 'test source ' + s.number}))}};
  published.sources = published.sources.map(s => ({...s, contentHash: createHash('sha256').update('test source ' + s.number).digest('hex')}));
  const advisor = new MethodAdvisor({methods: methodCatalog.methods}), records = {};
  for (const task of caseRequests(spec)) {
    const request = task.request, parent = records[task.parentKey];
    if (parent) Object.assign(request, {parentId: parent.id, studyId: parent.studyId});
    request.methodSelection = advisor.confirm(request, catalog, {mode: 'manual'}).methodSelection;
    const record = buildStudy(catalog, request, parent);
    await repo.save(record);records[task.key] = record;
    Object.assign(published.tasks.find(t => t.key === task.key), {versionId: record.id, studyId: record.studyId});
  }
  assert.deepEqual(await listCases(dir, store, repo), []);
  await fs.mkdir(path.join(dir, 'strategy-cases'));
  await fs.writeFile(path.join(dir, 'strategy-cases', spec.id + '.json'), JSON.stringify(published));
  let detail = await readCase(dir, spec.id, store, repo);
  assert.equal(detail.evidenceStatus, 'matched');
  assert.equal((await listCases(dir, store, repo)).length, 1);
  const html = caseOverview(detail);
  assert.match(html, /data-case-result="npv-delay"/);
  assert.match(html, /case-note-8/);
  assert.match(html, /<sup><a href=/);
  store.data.documents[0].content += ' revision';
  detail = await readCase(dir, spec.id, store, repo);
  assert.equal(detail.evidenceStatus, 'needs-review');
  assert.equal(detail.sources[0].verification, 'changed');
  assert.deepEqual((await repo.get(records['npv-base'].id)).input, records['npv-base'].input);
  await assert.rejects(readCase(dir, '../escape', store, repo), /案例编号无效/);
  published.tasks[0].method = 'npv';
  await fs.writeFile(path.join(dir, 'strategy-cases', spec.id + '.json'), JSON.stringify(published));
  assert.deepEqual(await listCases(dir, store, repo), []);
});
