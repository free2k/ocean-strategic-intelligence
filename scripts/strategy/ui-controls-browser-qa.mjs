// Read-only against production: UI drafts, GETs and the non-persisting period preview; no AI or study writes.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHmac} from 'node:crypto';
const base = process.env.UI_QA_URL || 'http://127.0.0.1:3227/';
const out = process.env.UI_QA_OUT || '/tmp/ui-polish-qa-20261018/local';
const proxy = process.env.UI_QA_PROXY_URL;
await fs.mkdir(out, {recursive: true});
const browser = await chromium.launch({executablePath: '/Users/guangyi/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', headless: true});
const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
const local = ['127.0.0.1', 'localhost'].includes(new URL(base).hostname);
if (proxy) {
  assert.ok(local, 'Read-only data proxy must target a local preview');
}
if (local && (proxy || !process.env.UI_QA_TOKEN)) {
  const expiry = String(Date.now() + 3600000), token = expiry + '.' + createHmac('sha256', process.env.UI_QA_PASSWORD || 'strategy-local-test').update(expiry).digest('hex');
  await context.addCookies([{name: 'ocean_auth', value: token, url: base, httpOnly: true}]);
}
if (process.env.UI_QA_TOKEN && !proxy) await context.addCookies(['ocean_auth', 'site_auth'].map(name => ({name, value: process.env.UI_QA_TOKEN, domain: new URL(base).hostname, path: '/', httpOnly: true, sameSite: 'Lax'})));
const page = await context.newPage(), errors = [], writes = [], previews = [], pages = [], alignments = [], popups = [];
const reads = new Map(); // Reuse the same read-only data snapshot across viewport/theme checks.
let closing = false;
page.on('pageerror', error => errors.push(error.stack || error.message));
// These unmodified modules contain live processing-panel fixes copied forward at deployment.
if (proxy) await page.route(url => ['/processing-runs.js', '/classification-current.js'].includes(url.pathname), async route => {
  try {
    const response = await route.fetch({url: new URL(route.request().url().split('/').pop(), proxy).href, headers: {cookie: 'ocean_auth=' + process.env.UI_QA_TOKEN}});
    await route.fulfill({response});
  } catch {if (!closing) {errors.push('Preserved preview module unavailable'); await route.abort().catch(() => {});}}
});
await page.route('**/api/**', async route => {
  try {
  const request = route.request(), url = new URL(request.url());
  const preview = request.method() === 'POST' && url.pathname.endsWith('/api/period-reports/preview');
  if (preview) previews.push(url.pathname);
  if (request.method() !== 'GET' && !preview && !url.pathname.endsWith('/api/login')) {
    writes.push(url.pathname); await route.abort('blockedbyclient'); return;
  }
  if (proxy && (request.method() === 'GET' || preview)) {
    const relative = url.pathname.slice(new URL(base).pathname.length) + url.search;
    const key = request.method() + ' ' + relative + (request.postData() || '');
    if (reads.has(key)) {await route.fulfill(reads.get(key)); return;}
    const destination = url.pathname.startsWith('/api/filters') ? new URL(url.pathname + url.search, new URL(proxy).origin).href : new URL(relative, proxy).href;
    const response = await route.fetch({url: destination, headers: {...request.headers(), cookie: 'ocean_auth=' + process.env.UI_QA_TOKEN + '; site_auth=' + process.env.UI_QA_TOKEN}, timeout: 60000});
    const saved = {status: response.status(), headers: response.headers(), body: await response.body()};
    if (response.ok()) reads.set(key, saved);
    await route.fulfill(saved);
  } else await route.continue();
  } catch {
    if (!closing) {errors.push('Read-only data request failed: ' + new URL(route.request().url()).pathname); await route.abort().catch(() => {});}
  }
});
async function ready(view) {
  await page.waitForFunction(view => {
    if (document.body.dataset.view !== view) return false;
    const content = document.querySelector('#content');
    const shadowHost = content?.querySelector('#sensing-host, #quant-native');
    if (view === 'analysis') return !!shadowHost?.shadowRoot?.querySelector('.dw-filters') && shadowHost.shadowRoot.querySelector('#content')?.getAttribute('aria-busy') !== 'true' && shadowHost.shadowRoot.querySelector('#dw-records')?.getAttribute('aria-busy') !== 'true';
    if (['sources', 'library'].includes(view)) return (shadowHost?.shadowRoot?.querySelector('#app')?.textContent.trim().length || 0) > 40;
    const selector = {home: '#home-release', monitor: '#monitor-tools', dashboard: '#country-toolbar', research: '#strategy-root'}[view];
    return !!content?.querySelector(selector) && (content?.textContent.trim().length || 0) > 40;
  }, view, {timeout: 60000});
}
async function measure(name) {
  const values = await page.evaluate(() => {
    const roots = [document, ...[...document.querySelectorAll('#sensing-host, #quant-native')].map(host => host.shadowRoot).filter(Boolean)];
    const results = [];
    for (const root of roots) for (const row of root.querySelectorAll('.filters, .strategy-form-row, .strategy-discovery-filters, .classification-filters, .period-reports .tools, .dw-filters, .form-grid, .dw-edit-grid')) {
      const fields = [...row.children].filter(el => el.matches('label, .strategy-field'));
      const bounds = fields.map(field => {
        const control = field.querySelector(':scope > details > summary') || field.querySelector('select:not([hidden]), input:not([hidden]):not([type=checkbox])');
        if (!control || !control.checkVisibility()) return null;
        const f = field.getBoundingClientRect(), c = control.getBoundingClientRect();
        return {fieldY: f.y, controlY: c.y, height: c.height};
      }).filter(Boolean);
      for (const fieldY of new Set(bounds.map(b => Math.round(b.fieldY)))) {
        const line = bounds.filter(b => Math.abs(b.fieldY - fieldY) < 1);
        if (line.length < 2) continue;
        results.push({row: row.className, controls: line.length, delta: Math.max(...line.map(b => b.controlY)) - Math.min(...line.map(b => b.controlY)), heights: line.map(b => b.height)});
      }
    }
    return results;
  });
  for (const row of values) {assert.ok(row.delta <= 1, `${name}: ${JSON.stringify(row)}`); assert.ok(row.heights.every(h => Math.abs(h - 44) <= 1), `${name}: ${JSON.stringify(row)}`);}
  alignments.push({name, rows: values});
}
async function screenshot(name) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: horizontal overflow`);
  await page.screenshot({path: `${out}/${name}.png`});
}
async function popupBounds(picker, name) {
  await picker.locator('[data-multi-menu]').waitFor({state: 'visible'});
  const bounds = await picker.locator('[data-multi-menu]').evaluate(menu => {
    const r = menu.getBoundingClientRect(); return {x: r.x, y: r.y, right: r.right, bottom: r.bottom, height: r.height, width: innerWidth, viewportHeight: innerHeight, topLayer: menu.matches(':popover-open')};
  });
  assert.ok(bounds.x >= 11 && bounds.y >= 11 && bounds.right <= bounds.width - 11 && bounds.bottom <= bounds.viewportHeight - 11, `${name}: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.height > 240, `${name}: unusably small popup`); assert.ok(bounds.topLayer);
  popups.push({name, ...bounds}); await screenshot(name);
}
try {
  await page.goto(base + '#home');
  if (!process.env.UI_QA_TOKEN && !local) {await page.locator('#password').fill(process.env.UI_QA_PASSWORD || 'strategy-local-test'); await page.locator('#login-form button').click();}
  await ready('home');
  for (const width of process.env.UI_QA_SKIP_TOUR ? [] : [1440, 1024, 390]) for (const theme of ['dark', 'light']) {
    await page.setViewportSize({width, height: 1000});
    await page.evaluate(theme => document.body.classList.toggle('light', theme === 'light'), theme);
    for (const view of ['home', 'sources', 'library', 'monitor', 'dashboard', 'analysis', 'research']) {
      await page.goto(base + '#' + view); await ready(view);
      await measure(`${view}-${theme}-${width}`); await screenshot(`${view}-${theme}-${width}`);
      pages.push({view, width, theme});
      console.log(JSON.stringify({view, width, theme}));
    }
  }
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto(base + '#research'); await ready('research');
  await page.locator('[data-strategy-tab="recommend"]').click(); await page.locator('.strategy-discovery-filters').waitFor();
  await measure('discovery-filters'); await screenshot('discovery-aligned');
  await page.locator('[data-strategy-tab="methods"]').click(); await page.locator('[data-method-search]').waitFor();
  await measure('method-library');
  const search = await page.locator('[data-method-search]').boundingBox(), family = await page.locator('[data-method-family]').boundingBox();
  assert.ok(Math.abs(search.y - family.y) <= 1); assert.equal(search.height, family.height);
  await page.locator('[data-method-search]').scrollIntoViewIfNeeded(); await screenshot('method-library-aligned');
  await page.locator('[data-strategy-new]').click(); await page.locator('[data-country-picker]').waitFor();
  await measure('research-scope');
  let picker = page.locator('[data-country-picker]');
  await picker.locator('summary').click();
  await picker.locator('[data-country="US"]').check();
  await picker.locator('[data-country="NO"]').check();
  assert.equal(await picker.getAttribute('open'), '');
  assert.equal(await picker.locator('[data-multi-count]').innerText(), '2');
  await picker.locator('[data-multi-search]').fill('没有这个国家abcdef');
  await picker.locator('[data-multi-empty]').waitFor({state: 'visible'});
  await picker.locator('[data-multi-search]').fill('美国');
  assert.equal(await picker.locator('[data-multi-option]:visible').count(), 1);
  await picker.locator('[data-multi-search]').fill('');
  for (const width of [1440, 1024, 390]) for (const theme of ['dark', 'light']) {
    await page.keyboard.press('Escape');
    await page.setViewportSize({width, height: 1000}); await page.evaluate(t => document.body.classList.toggle('light', t === 'light'), theme);
    await picker.locator('summary').scrollIntoViewIfNeeded(); await picker.locator('summary').click();
    await popupBounds(picker, `countries-${theme}-${width}`);
  }
  await page.keyboard.press('Escape'); assert.equal(await picker.getAttribute('open'), null);
  assert.ok(await picker.locator('summary').evaluate(el => el === document.activeElement));
  await page.keyboard.press('ArrowDown'); await picker.locator('[data-multi-search]').waitFor({state: 'visible'});
  assert.ok(await picker.locator('[data-multi-search]').evaluate(el => el === document.activeElement));
  await page.keyboard.press('ArrowDown'); assert.ok(await page.evaluate(() => document.activeElement.matches('[data-multi-value]')));
  await page.keyboard.press('Escape');
  await page.setViewportSize({width: 390, height: 640}); await picker.locator('summary').scrollIntoViewIfNeeded();
  await picker.locator('summary').click(); await popupBounds(picker, 'countries-short-screen'); await page.keyboard.press('Escape');
  await page.setViewportSize({width: 1440, height: 1000});
  await picker.locator('summary').click(); await page.locator('.strategy-hero h1').click(); assert.equal(await picker.getAttribute('open'), null);
  await page.reload(); await picker.waitFor();
  assert.match(await picker.locator('[data-multi-summary]').innerText(), /挪威/); assert.match(await picker.locator('[data-multi-summary]').innerText(), /美国/);
  await picker.locator('summary').click(); await picker.locator('[data-country-reset]').click();
  assert.equal(await picker.locator('[data-multi-count]').isVisible(), false);
  await picker.locator('[data-multi-close]').last().click();
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto(base + '#home'); await ready('home');
  await page.evaluate(async () => {
    const {blankDraft} = await import('./strategy/state.js'); const d = blankDraft();
    d.tab = 'quant'; d.step = 1; d.title = '界面核查（仅浏览器草稿）'; d.taskType = 'evaluation'; d.method = 'topsis';
    const {saveDraft} = await import('./strategy/state.js'); saveDraft(d);
  });
  await page.goto(base + '#research'); await ready('research'); picker = page.locator('[data-multi-source]'); await picker.waitFor({state: 'attached'});
  await picker.evaluate(el => {for (let p = el.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;});
  await picker.locator('summary').click();
  const choices = picker.locator('[data-multi-value]'), count = Math.min(2, await choices.count());
  assert.ok(count > 0);
  const selected = [];
  for (let i = 0; i < count; i++) {selected.push(await choices.nth(i).inputValue()); await choices.nth(i).check();}
  assert.equal(await picker.getAttribute('open'), '');
  const urls = await page.evaluate(() => JSON.parse(sessionStorage.getItem('ocean-strategy-draft-v2')).provenance.urls.split('\n'));
  assert.deepEqual(urls, selected);
  assert.deepEqual(await page.locator('select[data-choice-multiple]').evaluate(el => [...el.selectedOptions].map(o => o.value)), selected);
  assert.equal(await choices.first().evaluate(el => !!el.closest('label').parentElement.closest('label')), false);
  await popupBounds(picker, 'source-links'); await page.keyboard.press('Escape');
  await page.reload(); await picker.waitFor({state: 'attached'});
  await picker.evaluate(el => {for (let p = el.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;});
  assert.equal(await picker.locator('[data-multi-count]').innerText(), String(count));
  await picker.locator('summary').click(); await picker.locator('[data-multi-clear]').click();
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('ocean-strategy-draft-v2')).provenance.urls), '');
  await picker.locator('[data-multi-close]').last().click();
  await page.locator('[data-custom-path="provenance.urls"]').click();
  await page.locator('[data-path="provenance.urls"]').waitFor();
  assert.ok(await page.locator('[data-path="provenance.urls"]').getAttribute('aria-describedby'));
  if (proxy || !base.includes('127.0.0.1')) {
    await page.goto(base + '#dashboard'); await ready('dashboard'); picker = page.locator('#dossier-countries'); await picker.waitFor();
    await picker.locator('summary').click(); await picker.locator('[data-multi-value="US"]').check();
    await picker.locator('[data-multi-value="NO"]').check();
    await picker.locator('[data-multi-search]').fill('美国');
    await page.waitForTimeout(800);
    assert.equal(await picker.getAttribute('open'), ''); assert.equal(await picker.locator('[data-multi-count]').innerText(), '2');
    assert.equal(await picker.locator('[data-multi-search]').inputValue(), '美国');
    assert.ok(await picker.locator('[data-multi-search]').evaluate(el => el === document.activeElement));
    await popupBounds(picker, 'dossier-countries'); await page.keyboard.press('Escape');
  }
  if (!process.env.UI_QA_SKIP_EXTRA) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height: 1000});
      await page.goto(base + '#sources'); await ready('sources');
      await page.locator('#sensing-host [data-tab="add"]').click(); await page.locator('#sensing-host #add-form').scrollIntoViewIfNeeded();
      await measure(`source-subscription-${width}`); await screenshot(`source-subscription-${width}`);
      await page.goto(base + '#library'); await ready('library');
      const settings = page.locator('#sensing-host .period-settings');
      await settings.locator('summary').click(); await settings.scrollIntoViewIfNeeded();
      await measure(`period-settings-${width}`); await screenshot(`period-settings-${width}`);
      await page.locator('#sensing-host #audit-rules').click();
      await page.locator('#sensing-host .rule-domain').first().waitFor();
      await page.locator('#sensing-host .rule-domain > summary').first().click();
      await page.locator('#sensing-host .rule-form').first().waitFor(); await screenshot(`rule-editor-${width}`);
      await page.locator('#sensing-host #close').click();
      await page.locator('#sensing-host #audit-upload').click(); await page.locator('#event-form').waitFor();
      await measure(`manual-intake-${width}`); await screenshot(`manual-intake-${width}`); await page.locator('#close-detail').click();
      await page.goto(base + '#analysis'); await ready('analysis');
      const openRecord = page.locator('#quant-native [data-dw-open]').first();
      if (await openRecord.count()) {
        await openRecord.click(); await page.locator('#quant-native [data-dw-mode="edit"]').click();
        await page.locator('#quant-native .dw-edit-grid').waitFor(); await measure(`data-editor-${width}`); await screenshot(`data-editor-${width}`);
        await page.locator('#quant-native [data-dw="close"]').first().click();
      }
    }
  }
  assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  const result = {passed: true, pageLayouts: pages.length, alignmentGroups: alignments.reduce((n, row) => n + row.rows.length, 0), pages, alignments, popups, checked: ['consistent 44px controls', 'same-row alignment', 'no horizontal overflow', 'dark/light', 'viewport-bound top-layer popups', 'search and empty state', 'multi-selection remains open', 'outside click', 'Escape and focus restoration', 'keyboard navigation', 'source links synchronize with draft and original select', 'reload persistence', 'clear selection', 'custom source explanation'], apiWrites: writes, readOnlyPreviews: previews.length, pageErrors: errors};
  await fs.writeFile(out + '/result.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({passed: true, pageLayouts: result.pageLayouts, alignmentGroups: result.alignmentGroups, popupLayouts: popups.length, apiWrites: writes.length, pageErrors: errors}));
} catch (error) {
  await page.screenshot({path: out + '/failure.png'});
  console.error(JSON.stringify({failure: error.message.split('\n')[0], url: page.url(), errors, content: (await page.locator('#content').first().innerText()).slice(0, 500)}));
  throw error;
} finally {closing = true; await page.unrouteAll({behavior: 'ignoreErrors'}); await browser.close();}
