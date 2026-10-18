import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {filterData} from '../core.mjs';
import {selectSeries} from '../series-evidence.mjs';
import {selectRegistries} from '../registry-evidence.mjs';
import {selectIEA} from '../iea-quant.mjs';
import {getQuantCatalog} from '../quant-routes.mjs';
import {safeScope, serveStrategy, buildStudy} from '../strategy/service.mjs';
import {rawFixture, matrixRequest} from './strategy-fixture.mjs';
import {recentRange, updatePeriod, hydrateScope, changeTopicChoice, isCustomTopic, customTopicError} from '../public/strategy/scope-state.js';
import {blankDraft, requestFrom, restoreRecord} from '../public/strategy/state.js';

test('country union filters documents once and agrees across statistics, registries and IEA', () => {
  const scope = safeScope({country: 'US, NO,US', from: '2026-04-01', to: '2026-07-31'});
  assert.equal(scope.country, 'NO,US');
  const documents = ['us', 'no', 'both', 'gb', 'none'].map(id => ({id, publishedAt: '2026-05-01'}));
  const rows = [{period: '2026-03', value: 1}, {period: '2026-07', value: 2}, {period: '2026-08', value: 3}];
  const data = {documents, events: [['us', ['US']], ['no', ['NO']], ['both', ['NO', 'US']], ['gb', ['GB']]].map(([documentId, countries]) => ({documentId, countries})), observations: [], relations: [], series: ['US', 'NO', 'GB', 'GLOBAL'].map(country => ({id: country, country, rows})), assetRegistries: Object.fromEntries(['US', 'NO', 'GB'].map(country => [country, {country, rows: [{id: country}]}])), ieaDatasets: {datasets: {test: {records: ['US', 'NO', 'GB', null].map(countryCode => ({countryCode, period: '2026'}))}}}};
  assert.deepEqual(filterData(data, scope).documents.map(d => d.id), ['us', 'no', 'both']);
  assert.deepEqual(selectSeries(data, scope).map(s => [s.id, s.rows.map(r => r.period)]), [['US', ['2026-07']], ['NO', ['2026-07']]]);
  assert.deepEqual(Object.keys(selectRegistries(data, {country: scope.country})), ['US', 'NO']);
  assert.deepEqual(selectIEA(data, scope).map(r => r.countryCode), ['US', 'NO']);
  assert.equal(filterData(data, {}).documents.length, 5);
  assert.deepEqual(selectSeries(data, {country: 'US'}).map(s => s.id), ['US']);
  assert.deepEqual(selectSeries(data, {country: 'GLOBAL'}).map(s => s.id), ['GLOBAL']);
});

test('recent periods use Beijing calendar months, clamp month ends and freeze on reload', () => {
  assert.deepEqual(recentRange('1m', new Date('2024-03-31T02:00:00Z')), {from: '2024-02-29', to: '2024-03-31'});
  assert.deepEqual(recentRange('12m', new Date('2024-02-29T02:00:00Z')), {from: '2023-02-28', to: '2024-02-29'});
  assert.deepEqual(recentRange('3m', new Date('2026-10-17T17:00:00Z')), {from: '2026-07-18', to: '2026-10-18'});
  assert.deepEqual(recentRange('6m', new Date('2026-10-18T02:00:00Z')), {from: '2026-04-18', to: '2026-10-18'});
  const d = blankDraft();
  d.scope.country = 'US,NO';
  updatePeriod(d, '6m', new Date('2026-10-18T02:00:00Z'));
  const restored = hydrateScope(JSON.parse(JSON.stringify(d)));
  assert.equal(restored.scope.from, '2026-04-18');
  assert.equal(restored.scope.country, 'NO,US');
  assert.equal(restored.period, '2026-04-18 至 2026-10-18');
  assert.equal(requestFrom(restored).provenance.period, restored.period);
  updatePeriod(restored, 'all');
  assert.equal(restored.scope.from, '');
  assert.equal(restored.scope.to, '');
  const legacy = hydrateScope({scope: {country: 'US'}, period: '2025年核定范围'});
  assert.equal(legacy.periodPreset, 'legacy');
  assert.equal(legacy.period, '2025年核定范围');
});

test('catalog offers full named choices even under an empty filter; calculations freeze the same multi-country scope', async () => {
  const raw = await rawFixture(), second = structuredClone(raw.series[0]);
  second.id = 'norway-fixture'; second.country = 'NO';
  raw.series.push(second);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'strategy-scope-'));
  try {
    let output;
    await serveStrategy({method: 'GET'}, {setHeader() {}}, new URL('http://local/api/strategy/catalog?country=GB'), {
      store: {data: raw}, dir, serial: fn => fn(), json: (_, status, data) => {assert.equal(status, 200); output = data;},
    });
    assert.equal(output.series.length, 0);
    assert.equal(output.filterOptions.topics.length, 6);
    assert.ok(output.filterOptions.countries.some(c => c.code === 'NO' && c.name === '挪威'));
    assert.ok(output.filterOptions.sources.some(s => s.id === 'eia' && s.name.includes('EIA')));
    const scope = safeScope({country: 'US,NO', from: '2024-03-01', to: '2024-06-30'});
    const catalog = getQuantCatalog(raw, scope);
    assert.equal(catalog.series.length, 2);
    const request = {title: '多国范围工程验证', method: 'growth', dataset: {kind: 'series', id: 'norway-fixture'}, scope, confirmed: true};
    const record = buildStudy(catalog, request);
    assert.equal(record.scope.country, 'NO,US');
    assert.deepEqual(record.input.rows.map(r => r.period), ['2024-03', '2024-04', '2024-05', '2024-06']);
    const restored = restoreRecord(record);
    assert.equal(restored.scope.country, 'NO,US');
    assert.equal(restored.scope.from, '2024-03-01');
    assert.equal(restored.periodPreset, 'legacy');
    const replay = buildStudy({}, {...request, runMode: 'frozen'}, record);
    assert.deepEqual(replay.calculation, record.calculation);
    assert.equal(replay.numericInputHash, record.numericInputHash);
  } finally {await fs.rm(dir, {recursive: true, force: true});}
});

test('custom research scopes never fall back to all platform data and survive saved-version replay', async () => {
  const raw = await rawFixture(), topic = '海上CCUS船管运输链（工程验证）';
  const scope = safeScope({topic}), catalog = getQuantCatalog(raw, scope);
  assert.equal(catalog.documents.length, 0);
  assert.equal(catalog.series.length, 0);
  assert.equal(selectIEA(raw, scope).length, 0);
  assert.equal(Object.keys(selectRegistries(raw, scope)).length, 0);
  assert.throws(() => buildStudy(catalog, {title: '自定义范围不可借用其他领域数据', method: 'growth', dataset: {kind: 'series', id: raw.series[0].id}, scope, confirmed: true}), /当前筛选下该序列不可用/);
  const record = buildStudy(catalog, {...matrixRequest(), scope});
  assert.equal(record.scope.topic, topic);
  const restored = restoreRecord(record);
  assert.equal(requestFrom(restored).scope.topic, topic);
  assert.ok(isCustomTopic(restored, [{id: '海洋油气'}]));
  const replay = buildStudy({}, {...matrixRequest(), scope: {}, runMode: 'frozen'}, record);
  assert.equal(replay.scope.topic, topic);
  assert.deepEqual(replay.calculation, record.calculation);
});

test('blank custom selection is incomplete, and preset changes retain the actual custom name privately', () => {
  const d = blankDraft(), topics = [{id: '海洋油气'}];
  changeTopicChoice(d, '__custom__', topics);
  assert.equal(d.scope.topic, ''); assert.match(customTopicError(d, topics), /请填写/);
  d.scope.topic = '自定义海洋研究';
  changeTopicChoice(d, '海洋油气', topics);
  assert.equal(d.scope.topic, '海洋油气'); assert.equal(customTopicError(d, topics), '');
  changeTopicChoice(d, '__custom__', topics);
  assert.equal(d.scope.topic, '自定义海洋研究');
  assert.equal(requestFrom(d).customTopic, undefined);
});
