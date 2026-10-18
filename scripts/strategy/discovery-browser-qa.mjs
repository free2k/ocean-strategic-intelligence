// Safe on production: all research changes stay in this isolated browser draft.
// No study save, collection, model, or recomputation endpoint is invoked.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base = process.env.STRATEGY_DISCOVERY_QA_URL || 'http://127.0.0.1:3222/';
const out = process.env.STRATEGY_DISCOVERY_QA_OUT || '/tmp/strategy-discovery-browser';
await fs.mkdir(out, {recursive: true});
const browser = await chromium.launch({executablePath: '/Users/guangyi/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', headless: true});
const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
if (process.env.STRATEGY_DISCOVERY_QA_TOKEN) await context.addCookies([{name: 'ocean_auth', value: process.env.STRATEGY_DISCOVERY_QA_TOKEN, url: base, httpOnly: true, sameSite: 'Lax'}]);
const page = await context.newPage(), errors = [], forbidden = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => {if (r.method() === 'POST' && !/\/api\/login$/.test(r.url())) forbidden.push(new URL(r.url()).pathname);});
const state = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('ocean-strategy-draft-v2')));
const reset = () => page.locator('[data-discovery-reset]').click();
const section = key => page.locator(`[data-discovery-section="${key}"]`).click();
const filter = (key, value) => page.locator(`[data-discovery-filter="${key}"]`).selectOption(value);
async function pages(attribute) {
  const ids = [];
  for (let i = 0; i < 1000; i++) {
    const shown = await page.locator(`[${attribute}]`).evaluateAll((els, attr) => els.map(e => e.getAttribute(attr)), attribute);
    assert.ok(shown.length <= 6); ids.push(...shown);
    const next = page.getByRole('button', {name: '下一页', exact: true});
    if (await next.isDisabled()) return ids;
    await next.click();
  }
  throw Error('pagination did not terminate');
}
try {
  await page.goto(base + '#research');
  if (!process.env.STRATEGY_DISCOVERY_QA_TOKEN) {await page.locator('#password').fill('strategy-local-test'); await page.locator('#login-form button').click();}
  await page.locator('.strategy-entry').first().waitFor({timeout: 60000});
  const catalog = await page.evaluate(async () => (await fetch('api/strategy/catalog')).json());
  assert.ok(catalog.discovery); const d = catalog.discovery;
  await page.locator('#strategy-tab-recommend').click();
  const opportunities = await pages('data-opportunity');
  assert.deepEqual(opportunities, d.opportunities.map(x => x.id));
  assert.equal(new Set(opportunities).size, opportunities.length);
  await reset();
  for (const direction of d.directions.filter(x => x.opportunities)) {
    await page.locator(`[data-discovery-direction="${direction.id}"]`).click();
    const actual = await pages('data-opportunity');
    assert.deepEqual(actual, d.opportunities.filter(x => x.classification.directionId === direction.id).map(x => x.id));
  }
  await reset(); await filter('status', 'engine-pending');
  assert.deepEqual(await page.locator('[data-recommend]').evaluateAll(els => els.map(e => e.dataset.recommend)), catalog.recommendations.filter(r => r.status === 'engine-pending').map(r => r.id));
  await reset();
  const target = d.opportunities.find(x => x.coverage);
  if (target) {
    const industry = target.classification.industryIds[0];
    await filter('industry', industry); await filter('task', 'statistics'); await filter('status', 'ready');
    const ids = await pages('data-opportunity');
    assert.ok(ids.includes(target.id));
    assert.ok(ids.every(id => d.opportunities.find(x => x.id === id).classification.industryIds.includes(industry)));
    await reset(); await page.locator('[data-discovery-search]').fill(target.title);
    assert.equal(await page.locator('[data-discovery-search]').evaluate(e => document.activeElement === e), true);
    const action = page.locator('[data-recommend]').first(), id = await action.getAttribute('data-recommend'), recommendation = catalog.recommendations.find(r => r.id === id);
    await action.click(); const draft = await state();
    assert.equal(draft.datasetId, recommendation.dataset.id); assert.equal(draft.title, recommendation.title); assert.equal(draft.method, recommendation.method);
    await page.locator('#strategy-tab-recommend').click(); assert.equal(await page.locator('[data-discovery-search]').inputValue(), target.title);
  }
  await reset(); await page.locator('[data-discovery-search]').fill('<无匹配项>');
  assert.equal(await page.locator('[data-opportunity]').count(), 0); assert.equal(await page.getByText('当前条件下没有匹配的选题').count(), 1);
  await section('themes'); assert.equal(await page.locator('[data-discovery-search]').inputValue(), '');
  assert.match(await page.locator('#strategy-root').innerText(), /人工审核更新.*尚未启用自动监测/);
  assert.doesNotMatch(await page.locator('#strategy-root').innerText(), /12个候选模板/);
  const themeIds = await pages('data-theme'); assert.deepEqual(themeIds, catalog.templates.map(t => t.id));
  await reset(); await page.locator('[data-discovery-direction="systems"]').click();
  const t = catalog.templates.find(t => t.classification.directionId === 'systems');
  await page.locator(`[data-template="${t.id}"]`).click();
  assert.equal((await state()).templateId, t.id); assert.equal((await state()).taskType, t.taskType);
  await page.locator('#strategy-tab-recommend').click(); assert.equal((await state()).discovery.section, 'themes');
  await page.reload(); await page.locator('[data-discovery-count]').waitFor({timeout: 60000});
  assert.equal((await state()).discovery.themes.direction, 'systems');
  await section('data'); assert.equal(await page.locator('[data-discovery-search]').inputValue(), '<无匹配项>');
  await reset();
  for (const width of [1440, 1024, 390]) for (const theme of ['dark', 'light']) {
    await page.setViewportSize({width, height: 1000}); await page.evaluate(t => document.body.classList.toggle('light', t === 'light'), theme);
    await section(theme === 'dark' ? 'data' : 'themes'); await reset();
    const dimensions = await page.evaluate(() => ({width: innerWidth, scroll: document.documentElement.scrollWidth}));
    assert.ok(dimensions.scroll <= dimensions.width + 1, JSON.stringify(dimensions));
    assert.ok(await page.locator('.strategy-discovery-card').count() <= 6);
    await page.screenshot({path: out + `/discovery-${theme}-${width}.png`, fullPage: true});
  }
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
  const result = {passed: true, classifiedOpportunities: opportunities.length, methodEntries: catalog.recommendations.length, themes: themeIds.length, maxCardsPerPage: 6, checked: ['deduplication', 'category counts', 'all pages', 'cross filters', 'search focus', 'empty results', 'stable dataset action', 'stable theme action', 'independent persistent filters', 'manual update policy', 'dark/light responsive layouts'], viewportWidths: [1440, 1024, 390], pageErrors: errors, researchWrites: forbidden.length};
  await fs.writeFile(out + '/browser-result.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally {await browser.close();}
