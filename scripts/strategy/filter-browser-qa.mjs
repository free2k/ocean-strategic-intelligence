// Read-only on production: creates browser-session drafts, never saves studies.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {recentRange} from '../../intelligence/public/strategy/scope-state.js';

const base = process.env.STRATEGY_FILTER_QA_URL || 'http://127.0.0.1:3218/';
const out = process.env.STRATEGY_FILTER_QA_OUT || '/tmp/strategy-filter-browser';
await fs.mkdir(out, {recursive: true});
const browser = await chromium.launch({executablePath: '/Users/guangyi/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', headless: true});
const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
if (process.env.STRATEGY_FILTER_QA_TOKEN) await context.addCookies([{name: 'ocean_auth', value: process.env.STRATEGY_FILTER_QA_TOKEN, url: base, httpOnly: true, sameSite: 'Lax'}]);
const page = await context.newPage(), errors = [];
let savedRequests = 0;
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => {if (r.method() === 'POST' && /\/api\/strategy\/studies/.test(r.url())) savedRequests++;});
const field = p => page.locator(`[data-path="${p}"]`);
const stored = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('ocean-strategy-draft-v2')));
const waitScope = async () => {
  await page.waitForFunction(() => !document.querySelector('[data-scope-feedback]')?.textContent.includes('正在读取'), undefined, {timeout: 60000});
  assert.ok(!/失败/.test(await page.locator('[data-scope-feedback]').innerText()));
};
const choose = async (p, value) => {await field(p).selectOption(value); await waitScope();};
try {
  await page.goto(base + '#research');
  if (!process.env.STRATEGY_FILTER_QA_TOKEN) {
    await page.locator('#login:not([hidden])').waitFor();
    await page.locator('#password').fill('strategy-filter-qa');
    await page.locator('#login-form button').click();
  }
  await page.locator('.strategy-entry').first().waitFor({timeout: 60000});
  const initial = await page.evaluate(async () => (await fetch('api/strategy/catalog')).json());
  await page.locator('[data-strategy-new]').click();
  await field('periodPreset').waitFor(); await waitScope();
  for (const p of ['scope.topic', 'scope.sourceId', 'periodPreset']) assert.equal(await field(p).evaluate(el => el.tagName), 'SELECT');
  assert.equal(await field('scope.country').count(), 0);
  assert.equal(await field('scope.topic').locator('option').count(), initial.filterOptions.topics.length + 1);
  assert.equal(await field('scope.sourceId').locator('option').count(), initial.filterOptions.sources.length + 1);
  assert.deepEqual(await field('periodPreset').locator('option').evaluateAll(els => els.map(e => e.value)), ['all', '1m', '3m', '6m', '12m', 'custom']);
  await field('title').fill('筛选交互核查（仅浏览器草稿）');
  await field('taskType').selectOption('statistics');
  await page.locator('[data-country-picker] summary').click();
  await page.locator('[data-country="US"]').check(); await waitScope();
  await page.locator('[data-country="NO"]').check(); await waitScope();
  assert.equal((await stored()).scope.country, 'NO,US');
  assert.match(await page.locator('[data-country-summary]').innerText(), /挪威/);
  assert.match(await page.locator('[data-country-summary]').innerText(), /美国/);
  await page.locator('[data-country-search]').fill('挪威');
  assert.equal(await page.locator('[data-country-name]:visible').count(), 1);
  await page.locator('[data-country-search]').fill('');
  await page.locator('[data-country-picker] summary').click();
  await choose('scope.sourceId', 'sodir-production');
  await choose('scope.topic', '海洋油气');
  await choose('periodPreset', '6m');
  const draft = await stored(), expected = recentRange('6m');
  assert.equal(draft.scope.from, expected.from); assert.equal(draft.scope.to, expected.to);
  const filtered = await page.evaluate(async scope => (await fetch('api/strategy/catalog?' + new URLSearchParams(scope))).json(), draft.scope);
  assert.ok(filtered.series.length > 0);
  assert.ok(filtered.series.every(s => s.id.startsWith('sodir-') || s.id === 'NO-qa'));
  assert.deepEqual(filtered.filterOptions, initial.filterOptions);
  const validation = await page.evaluate(async ({scope, series}) => {
    const r = await fetch('api/strategy/validate', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({title: '筛选范围只读核验（不保存研究）', method: 'growth', dataset: {kind: 'series', id: series.id}, scope, input: {}, confirmed: true})});
    return {httpStatus: r.status, ...await r.json()};
  }, {scope: draft.scope, series: filtered.series[0]});
  assert.equal(validation.httpStatus, 200); assert.equal(validation.saved, false);
  assert.equal(validation.resolvedInputSummary.periods, filtered.series[0].count);
  await page.reload(); await field('periodPreset').waitFor({timeout: 60000});
  assert.equal(await field('periodPreset').inputValue(), '6m');
  assert.deepEqual((await stored()).scope, draft.scope);
  await page.locator('[data-next="1"]').click(); await field('datasetId').waitFor();
  assert.equal(await field('datasetId').locator('option').count(), filtered.series.length + 1);
  await page.locator('.strategy-steps [data-step="0"]').click();
  await choose('periodPreset', '1m');
  assert.match(await page.locator('[data-scope-feedback]').innerText(), /暂无可用统计序列/);
  await choose('periodPreset', 'all');
  assert.equal((await stored()).scope.from, ''); assert.equal((await stored()).scope.to, '');
  await page.locator('[data-country-picker] summary').click();
  await page.locator('[data-country-reset]').click(); await waitScope();
  assert.equal((await stored()).scope.country, '');
  assert.equal(await page.locator('[data-country]:checked').count(), 0);
  await page.locator('[data-country-picker] summary').click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({width, height: 1000});
    await page.locator('[data-country-picker] summary').click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({path: `${out}/selectors-${width}.png`, fullPage: true});
    await page.locator('[data-country-picker] summary').click();
  }
  await page.addInitScript(() => {const key = 'ocean-strategy-draft-v2', d = JSON.parse(sessionStorage.getItem(key)); delete d.periodPreset; d.period = '原核定期间：2025'; d.scope.from = '2025-01-01'; d.scope.to = '2025-12-31'; sessionStorage.setItem(key, JSON.stringify(d));});
  await page.reload(); await field('periodPreset').waitFor({timeout: 60000});
  assert.equal(await field('periodPreset').inputValue(), 'legacy');
  assert.equal((await stored()).period, '原核定期间：2025');
  assert.deepEqual(errors, []); assert.equal(savedRequests, 0);
  const report = {passed: true, topics: initial.filterOptions.topics.length, countries: initial.filterOptions.countries.length, sources: initial.filterOptions.sources.length, multiCountry: draft.scope.country, frozenDates: expected, filteredSeries: filtered.series.length, validatedPeriods: validation.resolvedInputSummary.periods, viewports: [1440, 390], savedRequests, pageErrors: errors};
  await fs.writeFile(`${out}/result.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {await browser.close();}
