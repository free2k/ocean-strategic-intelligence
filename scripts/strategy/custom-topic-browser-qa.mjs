// Production safe: exercises only an isolated browser draft and catalog reads.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base = process.env.STRATEGY_TOPIC_QA_URL || 'http://127.0.0.1:3223/';
const out = process.env.STRATEGY_TOPIC_QA_OUT || '/tmp/strategy-custom-topic-browser';
await fs.mkdir(out, {recursive: true});
const browser = await chromium.launch({executablePath: '/Users/guangyi/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', headless: true});
const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
if (process.env.STRATEGY_TOPIC_QA_TOKEN) await context.addCookies([{name: 'ocean_auth', value: process.env.STRATEGY_TOPIC_QA_TOKEN, url: base, httpOnly: true, sameSite: 'Lax'}]);
const page = await context.newPage(), errors = [], writes = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => {if (r.method() === 'POST' && !/\/api\/login$/.test(r.url())) writes.push(new URL(r.url()).pathname);});
const choice = () => page.locator('[data-topic-choice]'), custom = () => page.locator('[data-custom-topic]');
const state = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('ocean-strategy-draft-v2')));
const waitScope = () => page.waitForFunction(() => !document.querySelector('[data-scope-feedback]')?.textContent.includes('正在读取'), undefined, {timeout: 60000});
const name = '海上CCUS船管运输链（仅浏览器核查）';
try {
  await page.goto(base + '#research');
  if (!process.env.STRATEGY_TOPIC_QA_TOKEN) {await page.locator('#password').fill('strategy-local-test'); await page.locator('#login-form button').click();}
  await page.locator('.strategy-entry').first().waitFor({timeout: 60000});
  const original = await page.evaluate(async () => (await fetch('api/strategy/catalog')).json());
  await page.locator('[data-strategy-new]').click(); await choice().waitFor();
  assert.equal(await choice().locator('option').count(), original.filterOptions.topics.length + 2);
  assert.equal(await choice().locator('option[value="__custom__"]').innerText(), '自定义');
  await page.locator('[data-path="title"]').fill('自定义研究领域交互核查（仅浏览器草稿）');
  await choice().selectOption('__custom__');
  assert.equal(await custom().evaluate(e => document.activeElement === e), true);
  assert.equal((await state()).scope.topic, '');
  await page.locator('[data-next="1"]').click();
  await page.getByRole('button', {name: '请填写自定义研究领域名称', exact: true}).waitFor();
  assert.equal(await page.locator('[data-path="title"]').count(), 1);
  await custom().fill('  ' + name + '  '); await custom().blur(); await waitScope();
  assert.equal((await state()).scope.topic, name);
  assert.match(await page.locator('[data-scope-feedback]').innerText(), /自定义领域暂无已核定统计序列/);
  const filtered = await page.evaluate(async topic => (await fetch('api/strategy/catalog?' + new URLSearchParams({topic}))).json(), name);
  assert.equal(filtered.scope.topic, name); assert.equal(filtered.series.length, 0);
  assert.deepEqual(filtered.filterOptions, original.filterOptions);
  await page.reload(); await custom().waitFor({timeout: 60000});
  assert.equal(await choice().inputValue(), '__custom__'); assert.equal(await custom().inputValue(), name);
  await page.locator('[data-next="1"]').click(); await page.locator('[data-path="datasetId"]').waitFor();
  assert.equal(await page.locator('[data-path="datasetId"] option').count(), 1);
  await page.locator('.strategy-steps [data-step="0"]').click();
  await choice().selectOption('海洋油气'); await waitScope();
  assert.equal(await custom().count(), 0); assert.equal((await state()).scope.topic, '海洋油气');
  assert.match(await page.locator('[data-scope-feedback]').innerText(), /可用统计序列/);
  await choice().selectOption('__custom__'); await waitScope(); assert.equal(await custom().inputValue(), name);
  for (const width of [1440, 390]) for (const theme of ['dark', 'light']) {
    await page.setViewportSize({width, height: 1000}); await page.evaluate(t => document.body.classList.toggle('light', t === 'light'), theme);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.equal(await custom().getAttribute('maxlength'), '120');
    assert.ok(await custom().evaluate(e => document.getElementById(e.getAttribute('aria-describedby'))?.textContent.length > 0));
    await page.screenshot({path: out + `/custom-topic-${theme}-${width}.png`, fullPage: true});
  }
  await choice().selectOption(''); await waitScope();
  assert.equal((await state()).scope.topic, ''); assert.equal(await custom().count(), 0);
  assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  const result = {passed: true, standardTopics: original.filterOptions.topics.length, customOption: true, checked: ['blank rejection', 'custom input focus', 'trim and matching', 'no unrelated series fallback', 'draft reload', 'manual data entry', 'preset restoration', 'custom name restoration', 'all topics reset', 'responsive light/dark layouts'], viewports: [1440, 390], researchWrites: writes.length, pageErrors: errors};
  await fs.writeFile(out + '/result.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally {await browser.close();}
