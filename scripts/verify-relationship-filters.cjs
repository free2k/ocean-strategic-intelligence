// Isolated acceptance of the real app and graph, without a database or published brief.
// Run with CHROME_EXECUTABLE and, if ECharts is not installed, ECHARTS_JS.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright-core');
const repo = path.resolve(__dirname, '..');
const topics = ['海洋油气', '海上风电', '海洋低碳', '多能融合', '宏观政策', '海洋装备'];
const countries = [{code: 'CN', name: '中国'}, {code: 'NO', name: '挪威'}, {code: 'US', name: '美国'}];
const sources = [{id: 's1', name: '来源甲'}, {id: 's2', name: '来源乙'}];
const documents = [
 {id: 'a', topic: '海洋油气', country: 'CN', sourceId: 's1', publishedAt: '2026-10-01'},
 {id: 'b', topic: '海上风电', country: 'NO', sourceId: 's2', publishedAt: '2026-10-15'},
 {id: 'c', topic: '海上风电', country: 'CN', sourceId: 's1', publishedAt: '2026-10-17'}
].map(d => ({...d, title: d.id, url: 'https://example.test/' + d.id}));
const entities = Array.from({length: 6}, (_, i) => ({id: 'n' + i, name: '主体' + i, type: i % 2 ? '项目' : '公司'}));
entities[3].type = '技术'; entities[5].type = '公司';
const relationTypes = {a: '投资', b: '合作', c: '供货'};
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};

(async () => {
 const echarts = process.env.ECHARTS_JS || require.resolve('echarts/dist/echarts.min.js');
 let delayed = null;
 const requests = [], errors = [], passed = [];
 const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost'), query = url.searchParams;
  const json = (value, status = 200) => {res.writeHead(status, {'Content-Type': 'application/json'}); res.end(JSON.stringify(value));};
  if (url.pathname.startsWith('/api/')) {
   requests.push(url);
   if (url.pathname === '/api/session') return json({authenticated: true, modelReady: false});
   if (url.pathname === '/api/options') return json({graph: countries});
   if (url.pathname === '/api/monitor-period') return json({error: 'No published brief exists'}, 404);
   if (url.pathname !== '/api/data') return json({error: 'Unexpected API'}, 404);
   if (query.get('country') === 'US') return json({error: 'Temporarily unavailable'}, 503);
   if (delayed && query.get('topic') === '海洋油气' && query.get('from') === '2026-10-01') await delayed.promise;
   const selected = documents.filter(d => ['topic', 'country', 'sourceId'].every(key => !query.get(key) || d[key] === query.get(key)) && (!query.get('from') || d.publishedAt >= query.get('from')) && (!query.get('to') || d.publishedAt <= query.get('to')));
   return json({documents: selected, relations: selected.map(d => ({id: 'r' + d.id, from: 'n' + documents.indexOf(d) * 2, to: 'n' + (documents.indexOf(d) * 2 + 1), type: relationTypes[d.id], documentId: d.id})),
    entities, topics, sources, countryOptions: countries, events: [], observations: [], evidence: [], connections: [], series: [], errors: [], generatedAt: '2026-10-18T00:00:00Z'});
  }
  if (url.pathname === '/world.json') return json(countries);
  let file = url.pathname === '/' ? 'intelligence/public/index.html' : url.pathname === '/industry-topics.mjs' ? 'intelligence/industry-topics.mjs' : url.pathname.startsWith('/quant/') ? 'intelligence/quant-preview/' + url.pathname.slice(7) : 'intelligence/public' + url.pathname;
  file = url.pathname === '/quant/echarts.js' ? echarts : path.resolve(repo, file);
  if (file !== echarts && !file.startsWith(repo + path.sep)) {res.writeHead(404).end(); return;}
  try {res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/javascript'); res.end(await fs.readFile(file));}
  catch {res.writeHead(404).end();}
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 let browser;
 try {
  browser = await chromium.launch({headless: true, ...(process.env.CHROME_EXECUTABLE ? {executablePath: process.env.CHROME_EXECUTABLE} : {})});
  const page = await browser.newPage({viewport: {width: 1400, height: 1100}, reducedMotion: 'reduce'});
  page.on('pageerror', e => errors.push(e.message));
  const base = 'http://127.0.0.1:' + server.address().port;
  const graphIds = () => page.locator('.relationship-canvas').evaluate(el => window.echarts.getInstanceByDom(el).getOption().series[0].links.filter(e => e.kind === 'relation').flatMap(e => e.recordIds).sort());
  async function ready(ids) {
   await page.waitForFunction(() => {const el = document.querySelector('.relationship-canvas'); return el && window.echarts?.getInstanceByDom(el) && document.querySelector('[data-relationship-chart]')?.getAttribute('aria-busy') !== 'true';});
   assert.deepEqual(await graphIds(), ids);
   assert.equal(await page.locator('#monitor-filter-slot .filters').count(), 1);
   assert.equal(await page.locator('[data-rel-domain]').count(), 0);
   assert.equal(await page.locator('[data-rel-entity-type]').count(), 1);
   assert.equal(await page.locator('[data-rel-relation-type]').count(), 1);
  }
  await page.goto(base + '/#monitor?view=relations'); await ready(['ra', 'rb', 'rc']);
  assert.ok(!requests.some(url => url.pathname === '/api/monitor-period'));
  passed.push('relations work without a published brief');
  await page.selectOption('#topic', '海上风电'); await ready(['rb', 'rc']);
  assert.equal(await page.locator('#topic').inputValue(), '海上风电');
  assert.equal(new URLSearchParams((await page.evaluate(() => location.hash)).split('?')[1]).get('topic'), '海上风电');
  await page.selectOption('#topic', '海洋油气'); await ready(['ra']);
  assert.match(await page.locator('[data-rel-primary-scope]').textContent(), /海洋油气/);
  passed.push('primary toolbar owns domain selection without duplicate secondary controls');
  await page.selectOption('#topic', '海上风电'); await ready(['rb', 'rc']);
  const primaryHash = await page.evaluate(() => location.hash), primaryRequests = requests.filter(url => url.pathname === '/api/data').length;
  await page.selectOption('[data-rel-entity-type]', '公司'); await ready(['rb', 'rc']);
  await page.selectOption('[data-rel-relation-type]', '供货'); await ready(['rc']);
  assert.match(await page.locator('[data-rel-refine-count]').textContent(), /一级 2 条关系 → 二级 1 条/);
  await page.locator('[data-rel-expand]').click(); await ready(['rc']);
  assert.equal(await page.locator('[data-rel-relation-type]').inputValue(), '供货');
  await page.locator('[data-rel-search-toggle]').click(); await page.locator('[data-rel-search]').fill('主体2'); await page.locator('[data-rel-search]').press('Enter');
  assert.equal(await page.locator('[data-rel-result]').count(), 0);
  await page.locator('[data-rel-search]').fill('主体4'); await page.locator('[data-rel-search]').press('Enter'); await ready(['rc']);
  assert.equal(await page.locator('#topic').inputValue(), '海上风电');
  await page.locator('[data-rel-expand]').click(); await ready(['rc']);
  passed.push('secondary type and relation filters intersect; search and expansion retain them');
  await page.selectOption('[data-rel-entity-type]', '技术'); await ready([]);
  assert.equal(await page.locator('[data-rel-relation-type]').inputValue(), '供货');
  assert.match(await page.locator('[data-rel-relation-type] option:checked').textContent(), /供货 · 0/);
  await page.locator('[data-rel-expand]').click(); await ready([]);
  assert.equal(await page.locator('[data-rel-status]').isVisible(), true);
  await page.locator('[data-rel-refine-reset]').click(); await ready(['rb', 'rc']);
  assert.equal(await page.evaluate(() => location.hash), primaryHash);
  assert.equal(requests.filter(url => url.pathname === '/api/data').length, primaryRequests);
  passed.push('empty intersections never broaden; secondary reset preserves primary scope without API refetch');
  await page.selectOption('[data-rel-relation-type]', '合作'); await ready(['rb']);
  await page.selectOption('#topic', '海洋油气'); await ready(['ra']);
  assert.equal(await page.locator('[data-rel-entity-type]').inputValue(), '');
  assert.equal(await page.locator('[data-rel-relation-type]').inputValue(), '');
  assert.deepEqual(await page.locator('[data-rel-relation-type] option').evaluateAll(options => options.map(o => o.value)), ['', '投资']);
  await page.selectOption('#topic', '海上风电'); await ready(['rb', 'rc']);
  passed.push('changing the primary scope resets secondary choices to available records');
  await page.selectOption('#country', 'CN'); await ready(['rc']);
  await page.selectOption('#source', 's1'); await ready(['rc']);
  await page.locator('#from').fill('2026-10-16'); await page.locator('#from').dispatchEvent('change'); await ready(['rc']);
  await page.locator('#to').fill('2026-10-18'); await page.locator('#to').dispatchEvent('change'); await ready(['rc']);
  await page.selectOption('[data-rel-entity-type]', '公司'); await page.selectOption('[data-rel-relation-type]', '供货'); await ready(['rc']);
  await page.locator('[data-rel-refine-reset]').click(); await ready(['rc']);
  assert.equal(await page.locator('#topic').inputValue(), '海上风电');
  assert.equal(await page.locator('#country').inputValue(), 'CN'); assert.equal(await page.locator('#source').inputValue(), 's1');
  await page.locator('[data-rel-expand]').click(); await ready(['rc']);
  passed.push('country, source and custom dates combine; expanding never widens filters');
  await page.locator('#from').fill('2030-01-01'); await page.locator('#from').dispatchEvent('change'); await ready([]);
  assert.equal(await page.locator('[data-rel-status]').isVisible(), true);
  await page.locator('#reset').click(); await ready(['ra', 'rb', 'rc']);
  passed.push('empty results stay empty and reset restores all records');
  await page.selectOption('#country', 'US'); await page.locator('#content h2').filter({hasText: '监测资料暂不可用'}).waitFor();
  assert.equal(await page.locator('#topic').count(), 1); assert.equal(await page.locator('.filters').isVisible(), true);
  await page.locator('#reset').click(); await ready(['ra', 'rb', 'rc']);
  passed.push('a failed request preserves working filter controls');
  delayed = deferred(); await page.selectOption('#topic', '海洋油气'); await ready(['ra']);
  const request = page.waitForRequest(r => r.url().includes('/api/data?') && new URL(r.url()).searchParams.get('from') === '2026-10-01');
  await page.locator('#from').fill('2026-10-01'); await page.locator('#from').dispatchEvent('change'); await request;
  assert.equal(await page.locator('#monitor-filter-slot .filters').count(), 1);
  assert.equal(await page.locator('[data-relationship-chart]').evaluate(el => el.inert), true);
  await page.selectOption('#topic', '海上风电'); await ready(['rb', 'rc']); delayed.resolve(); await page.waitForTimeout(100); await ready(['rb', 'rc']);
  passed.push('a late old response cannot replace the newest filter scope');
  await page.goto(base + '/#monitor?view=relations&topic=海上风电&country=CN&sourceId=s1&from=2026-10-16&to=2026-10-18'); await ready(['rc']);
  await page.setViewportSize({width: 390, height: 1000});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  for (const selector of ['[data-rel-entity-type]', '[data-rel-relation-type]']) assert.equal(await page.locator(selector).evaluate(el => {const box = el.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth;}), true);
  assert.deepEqual(errors, []); passed.push('scoped URLs reload correctly and secondary filters fit mobile');
  console.log(JSON.stringify({passed: true, checks: passed, pageErrors: errors}, null, 2));
 } finally {delayed?.resolve(); await browser?.close(); await new Promise(resolve => server.close(resolve));}
})().catch(error => {console.error(error); process.exitCode = 1;});
