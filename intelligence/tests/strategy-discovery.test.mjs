import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {recommendations} from '../strategy/service.mjs';
import {buildDiscovery, classifyTemplate, DISCOVERY_VERSION} from '../strategy/discovery.mjs';
import {templateReadiness} from '../strategy/governance.mjs';
import {discoveryPage, discoveryState, discoveryView, DISCOVERY_PAGE_SIZE} from '../public/strategy/discovery.js';
import {blankDraft, requestFrom} from '../public/strategy/state.js';
import {serveStrategy} from '../strategy/service.mjs';
import {rawFixture} from './strategy-fixture.mjs';
import os from 'node:os';
import path from 'node:path';

const templates = JSON.parse(await fs.readFile(new URL('../strategy/specs/research-templates.json', import.meta.url))).templates;
function fixture(n = 1) {
  return {sources: [{id: 'test-source', name: '工程演示来源'}], industries: [{topic: '多能融合', name: '多能融合', articles: 2, observations: 0}], series: Array.from({length: n}, (_, i) => ({id: 'test-' + i, name: '工程演示序列 ' + String(i).padStart(4, '0'), topic: i % 2 ? '宏观政策' : '海洋油气', sourceId: 'test-source', country: 'US', unit: '演示单位', rows: Array.from({length: 14}, (_, j) => ({period: `${2024 + Math.floor(j / 12)}-${String(j % 12 + 1).padStart(2, '0')}`, value: j + 1}))}))};
}
function catalogFor(data, extra = []) {
  const items = recommendations(data), themes = [...templates, ...extra].map(t => classifyTemplate(templateReadiness(t, data)));
  return {recommendations: items, templates: themes, discovery: buildDiscovery(items, themes), tasks: {statistics: '统计', evaluation: '评价', optimization: '优化'}};
}

test('structured metadata classifies new data, merges methods and preserves every stable action once', () => {
  const c = catalogFor(fixture(3)), d = c.discovery;
  assert.equal(d.version, DISCOVERY_VERSION);
  assert.equal(d.counts.opportunities, 5);
  assert.equal(d.counts.methods, 8);
  assert.deepEqual(d.opportunities.flatMap(g => g.actions).sort(), c.recommendations.map(r => r.id).sort());
  const a = d.opportunities.find(g => g.id === 'series:test-0'), b = d.opportunities.find(g => g.id === 'series:test-1');
  assert.equal(a.actions.length, 2); assert.equal(a.classification.directionId, 'development');
  assert.equal(b.classification.directionId, 'policy');
  assert.equal(d.directions.reduce((n, x) => n + x.opportunities, 0), d.counts.opportunities);
  for (const r of c.recommendations) assert.equal(r.status, r.dataset ? 'ready' : r.method === 'milp' ? 'engine-pending' : 'needs-data');
});

test('classification never guesses industry from titles or upgrades data readiness', () => {
  const data = fixture(); data.series[0].topic = 'unknown'; data.series[0].name = '海上风电（标题不能替代核定分类）';
  const c = catalogFor(data), r = c.recommendations.find(r => r.dataset);
  assert.equal(r.classification.directionId, 'unclassified'); assert.deepEqual(r.classification.industryIds, []);
  const future = classifyTemplate({id: 'future', title: '风电研究', taskType: 'economics'});
  assert.equal(future.classification.directionId, 'unclassified');
  const offshore = templates.find(t => t.id === 'TH01');
  assert.equal(templateReadiness(offshore, data).dataStatus, 'needs-data');
  assert.equal(templateReadiness(offshore, fixture()).dataStatus, 'needs-review');
  assert.equal(templateReadiness(offshore, fixture()).canExecute, false);
});

test('theme library grows through declared metadata without a template-ID task map', () => {
  const future = {...templates[0], id: 'TH-FUTURE', taskType: 'correlation', classification: {directionId: 'systems', industryIds: ['海洋新能源', '多能融合']}};
  const c = catalogFor(fixture(), [future]), state = discoveryState(blankDraft()); state.section = 'themes'; state.themes.direction = 'systems';
  const view = discoveryPage(c, state), added = view.items.find(t => t.id === future.id);
  assert.equal(c.discovery.counts.themes, templates.length + 1); assert.equal(added.taskType, 'correlation');
  assert.deepEqual(added.classification.industryIds, ['海上风电', '多能融合']);
  assert.equal(c.discovery.directions.reduce((n, d) => n + d.themes, 0), c.templates.length);
  assert.match(discoveryView(c, state), /data-template="TH-FUTURE"/);
  assert.doesNotMatch(discoveryView(c, state), /12个候选模板/);
});

test('large catalogs render bounded pages with stable filters and action status', () => {
  const c = catalogFor(fixture(1001)), draft = blankDraft(), state = discoveryState(draft);
  assert.equal(c.discovery.counts.opportunities, 1003);
  let view = discoveryPage(c, state); assert.equal(view.items.length, DISCOVERY_PAGE_SIZE);
  assert.equal((discoveryView(c, state).match(/data-opportunity=/g) || []).length, DISCOVERY_PAGE_SIZE);
  state.data.page = 2; const second = discoveryPage(c, state);
  assert.equal(new Set([...view.items, ...second.items].map(x => x.id)).size, 12);
  state.data.page = 9999; view = discoveryPage(c, state); assert.equal(view.page, view.pages);
  state.data.industry = '宏观政策'; state.data.status = 'ready'; state.data.page = 1;
  view = discoveryPage(c, state); assert.equal(view.total, 500);
  assert.ok(view.items.every(x => x.classification.directionId === 'policy' && x.actions.every(a => a.status === 'ready')));
  state.data.direction = 'systems'; assert.equal(discoveryPage(c, state).total, 0);
  state.data = {q: '<script> & "', page: 1}; const html = discoveryView(c, state);
  assert.equal(discoveryPage(c, state).total, 0); assert.match(html, /&lt;script&gt; &amp; &quot;/); assert.doesNotMatch(html, /value="<script>/);
  draft.title = '原研究草稿'; draft.confirmed = true; draft.requestId = 'unchanged';
  const request = requestFrom(draft); assert.equal(request.confirmed, true); assert.equal(request.requestId, 'unchanged'); assert.equal(request.discovery, undefined);
});

test('partial and discontinuous data do not acquire trend actions through classification', () => {
  const data = fixture(2); data.series[0].rows[1].partial = true; data.series[1].rows.splice(2, 1);
  const c = catalogFor(data);
  assert.equal(c.recommendations.filter(r => r.method === 'trend').length, 0);
  assert.equal(c.discovery.opportunities.filter(g => g.coverage).length, 2);
});

test('scoped API classification and series choices use the same catalog, with no inferred ready theme', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'strategy-discovery-'));
  try {
    const store = {data: await rawFixture()};
    const get = async query => {
      let response;
      await serveStrategy({method: 'GET'}, {setHeader() {}}, new URL('http://local/api/strategy/catalog' + query), {store, dir, json: (_, status, body) => {assert.equal(status, 200); response = body;}});
      return response;
    };
    const all = await get('');
    assert.equal(all.discovery.version, DISCOVERY_VERSION);
    for (const r of all.recommendations.filter(r => r.dataset)) assert.ok(all.series.some(s => s.id === r.dataset.id));
    assert.ok(all.templates.every(t => t.canExecute === false && t.dataStatus !== 'ready'));
    const empty = await get('?country=NO'), state = discoveryState(blankDraft());
    assert.equal(empty.series.length, 0); assert.ok(empty.recommendations.every(r => !r.dataset));
    state.data.task = 'statistics'; state.data.status = 'ready';
    assert.equal(discoveryPage(empty, state).total, 0);
    const html = discoveryView(empty, state);
    assert.match(html, /value="statistics" selected/); assert.match(html, /value="ready" selected/);
  } finally {await fs.rm(dir, {recursive: true, force: true});}
});
