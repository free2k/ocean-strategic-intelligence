// Production-safe: edits only an isolated browser draft and calls /validate.
import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.STRATEGY_GUIDED_QA_URL || 'http://127.0.0.1:3220/';
const out = process.env.STRATEGY_GUIDED_QA_OUT || '/tmp/strategy-guided-browser';
await fs.mkdir(out, {recursive: true});
const browser = await chromium.launch({executablePath: '/Users/guangyi/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', headless: true});
const context = await browser.newContext({viewport: {width: 1440, height: 1050}});
if (process.env.STRATEGY_GUIDED_QA_TOKEN) await context.addCookies([{name: 'ocean_auth', value: process.env.STRATEGY_GUIDED_QA_TOKEN, url: base, httpOnly: true, sameSite: 'Lax'}]);
const page = await context.newPage(), errors = []; let saves = 0;
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => {if (r.method() === 'POST' && /\/api\/strategy\/studies/.test(r.url())) saves++;});
const field = p => page.locator(`[data-path="${p}"]`), choice = p => page.locator(`[data-choice-path="${p}"]`);
const state = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('ocean-strategy-draft-v2')));
const step = n => page.locator(`.strategy-steps [data-step="${n}"]`).click();
const choose = (p, value) => choice(p).selectOption(String(value));
async function custom(p, value) {if (await choice(p).count()) await choose(p, '__custom__'); await field(p).fill(String(value)); await field(p).blur();}
async function exceptions() {
  const unexplained = await page.locator('#strategy-form input:not([readonly]),#strategy-form textarea').evaluateAll(els => els.filter(e => e.dataset.path !== 'title' && e.type !== 'search' && e.type !== 'checkbox' && (!e.hasAttribute('data-free-input') || !document.getElementById(e.getAttribute('aria-describedby'))?.textContent.trim())).map(e => e.outerHTML));
  assert.deepEqual(unexplained, []);
}
try {
  await page.goto(base + '#research');
  if (!process.env.STRATEGY_GUIDED_QA_TOKEN) {await page.locator('#password').fill('strategy-local-test'); await page.locator('#login-form button').click();}
  await page.locator('.strategy-entry').first().waitFor({timeout: 60000});
  const catalog = await page.evaluate(async () => (await fetch('api/strategy/catalog')).json());
  await page.locator('[data-strategy-new]').click(); await field('title').fill('选择式研究流程核查（仅浏览器草稿，不归档）');
  for (const p of ['functionalUnit', 'population', 'systemBoundary', 'baseYear', 'currencyBasis']) assert.equal(await choice('configuration.' + p).evaluate(e => e.tagName), 'SELECT');
  await choose('configuration.functionalUnit', '每MWh净发电量');
  await choose('configuration.population', '本次评价矩阵列出的全部对象');
  await choose('configuration.systemBoundary', '仅比较本次列出的对象和指标');
  await choose('configuration.baseYear', '2025');
  await choose('configuration.currencyBasis', '不涉及货币量');
  await exceptions(); await step(1);
  assert.equal(await field('datasetId').locator('option').count(), 1); // Evaluation cannot accept a lone time series.
  assert.ok(await choice('indicators.0.name').locator('option').count() > 12);
  await choose('indicators.0.name', '产量/发电量'); await choose('indicators.0.unit', 'MWh');
  await choose('indicators.0.frequency', '年度');
  if (catalog.inputOptions.objects.length) await choose('objects.0.label', catalog.inputOptions.objects[0].name);
  await custom('objects.1.label', '未登记对象（仅交互核查，不作业务事实）');
  assert.match(await field('objects.1.label').locator('..').innerText(), /不能选一个相似对象代替/);
  await field('matrix.0.0').fill('0'); assert.equal((await state()).matrix[0][0], 0);
  await exceptions();
  await page.locator('[data-evidence="0:0"]').click();
  const ref = catalog.inputOptions.references[0];
  if (ref) await choose('evidence.0.0.sourceRef', `${ref.title}；${ref.url}`);
  await choose('evidence.0.0.period', '2025');
  await custom('evidence.0.0.reviewedBy', '工程交互核查（非专家认定）');
  assert.equal(await page.locator('dialog.strategy-evidence-dialog[open]').count(), 1);
  assert.ok(await page.locator('dialog .strategy-input-reason').count() > 0);
  await page.locator('[data-action="close-evidence"]').click();
  await page.reload(); await choice('objects.1.label').waitFor({timeout: 60000});
  assert.equal((await state()).objects[1].label, '未登记对象（仅交互核查，不作业务事实）');
  await step(2); await field('method').selectOption('topsis');
  await field('parameters.topsis.weightMethod').selectOption('ahp');
  await choose('parameters.topsis.judgments.0.1', 3);
  assert.equal((await state()).parameters.topsis.judgments[1][0], 1 / 3);
  await field('parameters.topsis.weightMethod').selectOption('manual');
  await choose('parameters.topsis.weights.0', .4);
  await custom('parameters.topsis.weights.1', .600000123);
  assert.equal((await state()).parameters.topsis.weights[1], .600000123);
  await field('parameters.topsis.scanEnabled').selectOption('true');
  assert.equal((await state()).parameters.topsis.scanEnabled, true);
  await exceptions();
  await step(0); await field('taskType').selectOption('economics'); await step(2);
  await choose('parameters.npv.rate', .08); assert.equal((await state()).parameters.npv.rate, .08);
  await custom('parameters.npv.rate', .083457); assert.equal((await state()).parameters.npv.rate, .083457);
  assert.ok(await page.locator('.strategy-input-reason').count() > 0);
  await step(0); await field('taskType').selectOption('scenario'); await step(2);
  await choose('parameters.scenario.shocks.0', -.3); assert.equal((await state()).parameters.scenario.shocks[0], -.3);
  assert.equal(await field('parameters.scenario.baseline').getAttribute('type'), 'number');
  await exceptions();
  await step(0); await field('taskType').selectOption('statistics'); await step(1);
  await page.locator('[data-period-path="rows.0.period"][data-period-part="frequency"]').selectOption('month');
  await page.locator('[data-period-path="rows.0.period"][data-period-part="year"]').selectOption('2025');
  await page.locator('[data-period-path="rows.0.period"][data-period-part="slot"]').selectOption('01');
  assert.equal((await state()).rows[0].period, '2025-01');
  await field('rows.0.partial').selectOption('true'); assert.equal((await state()).rows[0].partial, true);
  await field('datasetId').selectOption(catalog.series[0].id);
  assert.equal(await choice('provenance.description').count(), 0);
  assert.equal(await page.locator('.strategy-source-readonly').count(), 1);
  await field('comparable').selectOption('true');await field('constraintsConfirmed').selectOption('true');
  await step(2); await page.locator('[data-confirm-current-method]').click(); await page.locator('[data-method-selection-status]').waitFor(); assert.equal(await field('confirmed').inputValue(), 'false'); await field('confirmed').selectOption('true');
  const validationPromise = page.waitForResponse(r => r.url().includes('/api/strategy/validate') && r.request().method() === 'POST');
  await page.locator('[data-action="validate"]').click(); const response = await validationPromise, validation = await response.json();
  assert.equal(response.status(), 200); assert.equal(validation.canExecute, true, JSON.stringify(validation)); assert.equal(validation.saved, false);
  assert.equal(validation.resolvedInputSummary.periods, catalog.series[0].count);
  await step(0);
  for (const width of [1440, 390]) {await page.setViewportSize({width, height: 1050}); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await page.screenshot({path: `${out}/guided-${width}.png`, fullPage: true});}
  assert.deepEqual(errors, []); assert.equal(saves, 0);
  const report = {passed: true, sourceReferences: catalog.inputOptions.references.length, objectChoices: catalog.inputOptions.objects.length, indicatorChoices: catalog.inputOptions.indicators.length, methodsChecked: ['topsis', 'ahp-weighting', 'npv', 'scenario', 'growth'], precisionRetained: .600000123, verifiedPeriods: validation.resolvedInputSummary.periods, viewports: [1440, 390], productionStudiesCreated: saves, paidAIRequests: 0, pageErrors: errors};
  await fs.writeFile(`${out}/result.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally {await browser.close();}
