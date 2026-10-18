const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright-core');

const publicDir = path.resolve(__dirname, '../intelligence/public');
const meta = { releaseId: 'release-original', generatedAt: '2026-10-18T06:00:00Z' };
const row = (id, events = 1) => ({ id, name: id, events, type: '项目', documents: 1, aliases: [] });
const list = (rows, total = rows.length) => ({ data: rows, total, meta });
const detail = id => ({ meta, data: {
  id, name: id, type: '项目',
  events: [{ id: 'event-' + id, versions: [{ documentId: 'document-' + id,
    bodyVersionId: 'body-' + id, releaseId: meta.releaseId, title: '事件-' + id,
    publishedAt: '2026-10-17', observedAt: meta.generatedAt, changeTypes: ['new_document'] }] }],
  facts: [{ quote: '保存的原文证据-' + id, versions: [{ documentId: 'document-' + id, bodyVersionId: 'body-' + id }] }]
} });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const html = `<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">
<style>body{margin:20px}.monitor-flow{display:flex;gap:12px}.monitor-flow-node{flex:1}progress{width:100%}</style>
<section id="monitor-flow"></section><section id="monitor-summary"></section><section id="object-host"></section>
<script type="module">
import {mountMonitorOverview} from './monitor-overview.js';
import {mountObjectBrowser} from './object-browser.js';
const query=new URL(location.href).searchParams.get('scope')||'';
const overview=mountMonitorOverview(document.querySelector('#monitor-flow'),document.querySelector('#monitor-summary'),{query});
window.selections=[];
const dispose=mountObjectBrowser(document.querySelector('#object-host'),{query,onSelection:(result,error)=>{
  window.selections.push({id:result?.data?.id,error});overview.set(result,error);
}});
window.disposeReplay=()=>{dispose();overview.dispose();};
</script>`;

(async () => {
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
    const filename = path.resolve(publicDir, '.' + pathname);
    if (!filename.startsWith(publicDir + path.sep) || !filename.endsWith('.js')) { res.writeHead(404).end(); return; }
    try { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.end(await fs.readFile(filename)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const passed = [];
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
    async function check(name, options, verify) {
      const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, reducedMotion: options.reducedMotion || 'no-preference' });
      const page = await context.newPage(), errors = [], requests = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.clock.install();
      await page.route('**/api/research/**', async route => {
        const url = new URL(route.request().url()); requests.push(url);
        if (url.pathname.endsWith('/monitor-summary')) {
          await route.fulfill({ json: { data: { kind: 'processed_batch', documents: 2, objects: 2, affectedDocuments: 1,
            affectedObjects: 1, comparisonCount: 0, comparisons: [], assessments: [] } } });
        } else if (url.pathname.endsWith('/objects')) {
          await route.fulfill({ json: options.list ? options.list(url.searchParams) : list([row('no-events', 0), row('first')]) });
        } else {
          const id = decodeURIComponent(url.pathname.split('/').at(-1));
          if (options.detail) await options.detail(route, id);
          else await route.fulfill({ json: detail(id) });
        }
      });
      try {
        await page.goto('http://127.0.0.1:' + server.address().port + '/?scope=' + encodeURIComponent('topic=海洋装备&from=2026-10-01'));
        await page.locator('.object-card').first().waitFor();
        await verify(page, requests);
        assert.deepEqual(errors, []);
        passed.push(name);
      } finally { await context.close(); }
    }

    const pending = deferred();
    await check('automatic replay uses real scoped evidence without blocking the list', {
      detail: async (route, id) => { await pending.promise; await route.fulfill({ json: detail(id) }); }
    }, async (page, requests) => {
      await page.waitForFunction(() => !document.querySelector('#object-content').hasAttribute('aria-busy'));
      assert.equal(await page.locator('[data-page-go]').isEnabled(), true);
      assert.equal(await page.locator('.object-card').first().evaluate(el => el.inert), false);
      pending.resolve();
      await page.locator('.monitor-flow-node').first().waitFor();
      assert.equal(await page.locator('.monitor-flow-node').count(), 4);
      assert.match(await page.locator('#monitor-flow').innerText(), /事件-first/);
      const request = requests.find(url => url.pathname.endsWith('/objects/first'));
      assert.equal(request.searchParams.get('releaseId'), meta.releaseId);
      assert.equal(request.searchParams.get('topic'), '海洋装备');
      assert.equal(request.searchParams.get('from'), '2026-10-01');
      assert.ok(!requests.some(url => url.pathname.endsWith('/objects/no-events')));
      await page.clock.runFor(3250);
      assert.equal(await page.locator('.monitor-flow-node.active').evaluate(el => [...el.parentElement.children].indexOf(el)), 1);
      await page.locator('[data-flow=pause]').click();
      const value = await page.locator('#monitor-flow progress').evaluate(el => el.value);
      await page.clock.runFor(1000);
      assert.equal(await page.locator('#monitor-flow progress').evaluate(el => el.value), value);
      await page.locator('[data-flow=replay]').click();
      await page.clock.runFor(12000);
      assert.equal(await page.locator('#monitor-flow progress').evaluate(el => el.value), 12);
      assert.equal(await page.locator('[data-flow=pause]').isDisabled(), true);
    });

    const stale = deferred(), delivered = deferred();
    await check('a late old preview cannot replace a newer search result', {
      list: params => list([row(params.get('q') ? 'new' : 'old')]),
      detail: async (route, id) => { if (id === 'old') await stale.promise; await route.fulfill({ json: detail(id) }); if (id === 'old') delivered.resolve(); }
    }, async page => {
      await page.locator('#object-search').fill('new');
      await page.clock.runFor(350);
      await page.waitForFunction(() => document.querySelector('#monitor-flow').textContent.includes('事件-new'));
      stale.resolve(); await delivered.promise; await page.waitForTimeout(50);
      assert.match(await page.locator('#monitor-flow').innerText(), /事件-new/);
      assert.ok(!(await page.evaluate(() => window.selections)).some(value => value.id === 'old'));
    });

    await check('pagination updates the replay while keeping the same release', {
      list: params => list([row(Number(params.get('offset')) ? 'page-two' : 'page-one')], 24)
    }, async page => {
      await page.waitForFunction(() => document.querySelector('#monitor-flow').textContent.includes('事件-page-one'));
      await page.locator('[data-list-page="1"]').click();
      await page.waitForFunction(() => document.querySelector('#monitor-flow').textContent.includes('事件-page-two'));
    });

    await check('objects without events keep an explicit empty state', {
      list: () => list([row('no-events', 0)])
    }, async (page, requests) => {
      assert.equal(await page.locator('.monitor-flow-node').count(), 0);
      assert.equal(await page.locator('[data-flow=replay]').isDisabled(), true);
      assert.equal(requests.filter(url => url.pathname.includes('/objects/')).length, 0);
    });

    await check('preview errors preserve the usable object list', {
      detail: route => route.fulfill({ status: 503, json: { message: '证据链暂时不可用' } })
    }, async page => {
      await page.waitForFunction(() => document.querySelector('#monitor-flow').textContent.includes('证据链暂时不可用'));
      assert.equal(await page.locator('.object-card').count(), 2);
      assert.equal(await page.locator('[data-page-go]').isEnabled(), true);
    });

    const disposed = deferred();
    await check('leaving the view suppresses a pending preview', {
      detail: async (route, id) => { await disposed.promise; await route.fulfill({ json: detail(id) }).catch(() => {}); }
    }, async page => {
      await page.evaluate(() => window.disposeReplay());
      const selections = await page.evaluate(() => window.selections.length);
      disposed.resolve(); await page.waitForTimeout(50);
      assert.equal(await page.evaluate(() => window.selections.length), selections);
    });

    await check('reduced motion retains manual playback', { reducedMotion: 'reduce' }, async page => {
      await page.locator('.monitor-flow-node').first().waitFor();
      await page.clock.runFor(1000);
      assert.equal(await page.locator('#monitor-flow progress').evaluate(el => el.value), 0);
      await page.locator('[data-flow=pause]').click();
      await page.clock.runFor(1000);
      assert.equal(await page.locator('#monitor-flow progress').evaluate(el => el.value), 1);
    });
    console.log(JSON.stringify({ passed: passed.length, checks: passed }, null, 2));
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
