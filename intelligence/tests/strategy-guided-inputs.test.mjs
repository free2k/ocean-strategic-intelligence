import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {rawFixture, matrixRequest} from './strategy-fixture.mjs';
import {getQuantCatalog} from '../quant-routes.mjs';
import {methodCatalog, buildStudy} from '../strategy/service.mjs';
import {taskNames} from '../strategy/governance.mjs';
import {buildInputOptions} from '../strategy/input-options.mjs';
import {blankDraft, requestFrom, restoreRecord, getPath} from '../public/strategy/state.js';
import {wizard} from '../public/strategy/wizard.js';
import {evidenceEditor,otherEditor} from '../public/strategy/matrix.js';
import {configureChoices, guidedInput, applyChoice, changePeriodPart, rememberCustom, choiceSpec} from '../public/strategy/guided-inputs.js';
const dictionary = JSON.parse(await fs.readFile(new URL('../strategy/specs/indicator-dictionary.json', import.meta.url)));
async function catalog() {
  const raw = await rawFixture();
  const c = getQuantCatalog(raw);
  return {...c, ...methodCatalog, tasks: taskNames, filterOptions: {topics: [], countries: [], sources: []}, assets: {series: c.series.length, points: 15}, inputOptions: buildInputOptions(raw, c, dictionary, ['合作']), indicatorDictionary: dictionary};
}

test('input choices come from scoped evidence and never manufacture objects or reviewers', async () => {
  const raw = await rawFixture();
  raw.entities.push({id: 'in', name: '入库对象', type: '项目', evidenceIds: ['fixture-evidence']}, {id: 'out', name: '范围外对象', evidenceIds: ['outside-evidence']});
  const c = getQuantCatalog(raw), options = buildInputOptions(raw, c, dictionary, ['合作']);
  assert.deepEqual(options.objects.map(o => o.name), ['入库对象']);
  assert.ok(options.references.some(r => r.url === raw.documents[0].url));
  const d = blankDraft(); configureChoices(d, {...c, inputOptions: options});
  assert.equal(choiceSpec(d, 'provenance.author').choices.length, 0);
  d.provenance.author = '实际核定人'; rememberCustom(d, 'provenance.author');
  assert.ok(choiceSpec(d, 'evidence.0.0.reviewedBy').choices.some(([name]) => name === '实际核定人'));
  assert.equal(raw.entities.length, 2);
});

test('preset selection retains custom precision, factual zero and server contract values', async () => {
  const d = blankDraft(), c = await catalog(); configureChoices(d, c);
  applyChoice(d, 'configuration.functionalUnit', '每MWh净发电量');
  assert.equal(d.configuration.functionalUnit, '每MWh净发电量');
  applyChoice(d, 'parameters.weighted.weights.0', '0');
  assert.equal(getPath(d, 'parameters.weighted.weights.0'), 0);
  applyChoice(d, 'parameters.weighted.weights.0', '__custom__');
  assert.equal(getPath(d, 'parameters.weighted.weights.0'), 0);
  d.parameters.weighted.weights[0] = .1234567;
  assert.equal(requestFrom(d).input.weights, undefined); // Equal weighting does not submit dormant expert weights.
  d.parameters.weighted.weightMethod = 'manual';
  assert.equal(requestFrom(d).input.weights[0], .1234567);
  const ref = c.inputOptions.references[0];
  applyChoice(d, 'provenance.description', `${ref.title}；${ref.url}`);
  assert.equal(d.provenance.urls, ref.url);
  applyChoice(d, 'provenance.urls', [ref.url], true);
  assert.deepEqual(requestFrom(d).provenance.urls, [ref.url]);
  assert.ok(!JSON.stringify(requestFrom(d)).includes('__custom__'));
});

test('statistical-period selectors preserve period strings and never fill an incomplete period', () => {
  const d = blankDraft();
  changePeriodPart(d, 'rows.0.period', 'frequency', 'month');
  changePeriodPart(d, 'rows.0.period', 'year', '2024');
  assert.equal(d.rows[0].period, '');
  changePeriodPart(d, 'rows.0.period', 'slot', '02');
  assert.equal(d.rows[0].period, '2024-02');
  changePeriodPart(d, 'rows.0.period', 'frequency', 'quarter');
  assert.equal(d.rows[0].period, '');
  changePeriodPart(d, 'rows.0.period', 'slot', '2');
  assert.equal(d.rows[0].period, '2024-Q2');
  changePeriodPart(d, 'rows.0.period', 'frequency', 'year');
  assert.equal(d.rows[0].period, '2024');
});

test('editable inputs across methods and the evidence dialog explain every necessary exception', async () => {
  const c = await catalog();
  for (const method of ['weighted', 'ahp', 'moving', 'npv', 'scenario', 'network-degree', 'pearson', 'hhi']) {
    const d = blankDraft(); d.method = method;
    d.provenance.author = '尚未登记的真实姓名';
    d.provenance.description = '自有原表第3页';
    d.provenance.reason = '真实项目参数依据';
    d.objects[0].label = '未登记项目'; d.indicators[0].unit = '特殊工程单位';
    for (let step = 0; step < 4; step++) {
      d.step = step;
      const {document} = parseHTML('<html><body>' + wizard(d, c) + '</body></html>');
      for (const el of document.querySelectorAll('input:not([readonly]),textarea')) {
        if (el.dataset.path === 'title' || el.type === 'search' || el.type === 'checkbox' && el.hasAttribute('data-country')) continue;
        assert.ok(el.hasAttribute('data-free-input'), `${method}: ${el.outerHTML}`);
        const note = document.getElementById(el.getAttribute('aria-describedby'));
        assert.ok(note?.textContent.trim().length > 15, `${method}: missing explanation for ${el.dataset.path || el.id}`);
      }
    }
    configureChoices(d, c);
    const {document} = parseHTML('<html><body>' + evidenceEditor(d, 0, 0) + '</body></html>');
    for (const el of document.querySelectorAll('input:not([readonly]):not([type=search]),textarea')) assert.ok(document.getElementById(el.getAttribute('aria-describedby'))?.textContent);
  }
});

test('platform inputs show original provenance without redundant manual source questions', async () => {
  const c = await catalog(), d = blankDraft(); d.step = 1; d.method = 'growth'; d.datasetId = c.series[0].id;
  const {document} = parseHTML('<html><body>' + wizard(d, c) + '</body></html>');
  assert.ok(document.querySelector('.strategy-source-readonly'));
  assert.equal(document.querySelector('[data-choice-path="provenance.description"]'), null);
  assert.equal(document.querySelector('[data-choice-path="provenance.author"]'), null);
  assert.equal(d.confirmed, false);
});

test('legacy free text and numeric inputs survive rendering, draft restoration and replay unchanged', async () => {
  const old = buildStudy({}, matrixRequest()), d = restoreRecord(old), c = await catalog();
  const before = requestFrom(d);
  d.step = 1; const html = wizard(d, c);
  assert.match(html, /需要填写的原因/);
  assert.equal(d.objects[0].label, 'A');
  assert.equal(d.matrix[0][0], 1);
  assert.deepEqual(requestFrom(d), before);
  const replay = buildStudy({}, {...matrixRequest(), runMode: 'frozen'}, old);
  assert.deepEqual(replay.calculation, old.calculation);
  assert.ok(guidedInput(d, 'provenance.author', '核定人').includes('实际核定人') === false);
});


test('paging manual observations preserves all original periods and numbers outside the visible page', async () => {
 const d=blankDraft();d.method='growth';d.rows=Array.from({length:30},(_,i)=>({period:`${2024+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`,value:i,sourceRef:'原表核定记录'}));
 const c=await catalog();configureChoices(d,c);const before=structuredClone(requestFrom(d).input);
 let document=parseHTML('<html><body>'+otherEditor(d)+'</body></html>').document;
 assert.equal(document.querySelectorAll('input[data-path$=".value"]').length,25);
 d.dataPage=1;document=parseHTML('<html><body>'+otherEditor(d)+'</body></html>').document;
 assert.equal(document.querySelectorAll('input[data-path$=".value"]').length,5);
 assert.ok(document.querySelector('[data-path="rows.25.value"]'));
 assert.deepEqual(requestFrom(d).input,before);
});
