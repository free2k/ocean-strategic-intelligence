import fs from 'node:fs/promises';
import path from 'node:path';
import {fetch, ProxyAgent} from 'undici';
import {normalizeEia, mergeEia, endpoint} from './eia.mjs';
const dir = process.env.INTEL_DATA_DIR || '.data/intelligence';
const key = process.env.EIA_API_KEY;
if (!key) throw new Error('EIA_API_KEY is required');
await fs.mkdir(dir, {recursive:true});
const lockPath = path.join(dir, 'eia-import.lock');
const lock = await fs.open(lockPath, 'wx');
let dispatcher;
try {
  const url = new URL(endpoint);
  url.searchParams.set('api_key', key);
  let payload;
  for (const proxy of [false, true]) {
    if (proxy && !process.env.DOWNLOAD_PROXY) break;
    try {
      if (proxy) dispatcher = new ProxyAgent(process.env.DOWNLOAD_PROXY);
      const response = await fetch(url, {signal:AbortSignal.timeout(30000), ...(dispatcher ? {dispatcher} : {})});
      if (!response.ok) throw new Error('EIA HTTP ' + response.status);
      payload = await response.json();
      break;
    } catch {
      // Fetch errors may include the secret-bearing URL. Do not log them.
      if (proxy) throw new Error('EIA request failed; check network, key and quota');
    }
  }
  if (!payload) throw new Error('EIA unavailable; configure DOWNLOAD_PROXY if needed');
  const series = normalizeEia(payload, process.env.EIA_START || '2024-01');
  const snapshotPath = path.join(dir, 'snapshot.json');
  const data = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));
  const next = mergeEia(data, series);
  const archive = path.join(dir, 'eia-history');
  await fs.mkdir(archive, {recursive:true});
  const stamp = series.checkedAt.replaceAll(':','-');
  // EIA echoes api_key in request metadata; save only response data.
  await fs.writeFile(path.join(archive, stamp + '.json'), JSON.stringify({endpoint, checkedAt:series.checkedAt, response:payload.response, previous:data.series?.find(s=>s.id===series.id) || null}));
  const tmp = path.join(dir, 'eia-snapshot.tmp');
  await fs.writeFile(tmp, JSON.stringify(next));
  await fs.rename(tmp, snapshotPath);
  console.log(JSON.stringify({source:'EIA API v2',rows:series.rows.length,first:series.rows[0].period,latest:series.rows.at(-1),checkedAt:series.checkedAt}));
} finally {
  await dispatcher?.close();
  await lock.close();
  await fs.unlink(lockPath);
}
