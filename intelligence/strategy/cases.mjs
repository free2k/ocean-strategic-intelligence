import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {invalid} from './contracts.mjs';

const validId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(id);
const sha = value => createHash('sha256').update(value || '').digest('hex');

// Published cases reference actual immutable research versions; this reader never
// creates a study or promotes a research theme's independent readiness status.
export async function readCase(dir, id, store, repo) {
  if (!validId(id)) invalid('案例编号无效', [], 400);
  let item;
  try { item = JSON.parse(await fs.readFile(path.join(dir, 'strategy-cases', id + '.json'), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') invalid('研究案例尚未发布', [], 404); throw e; }
  if (item.id !== id || item.schemaVersion !== 1 || !Array.isArray(item.sources) || !Array.isArray(item.tasks)) invalid('案例档案格式异常', [], 503);
  const sources = item.sources.map(source => {
    const doc = store.data.documents.find(d => d.id === source.documentId);
    return {...source,sourceId:doc?.sourceId||'', verification: !doc ? 'missing' : doc.url !== source.url || sha(doc.content) !== source.contentHash ? 'changed' : 'matched'};
  });
  const records = await Promise.all(item.tasks.map(async task => {
    const record = await repo.get(task.versionId);
    if (record.templateId !== item.templateId || record.method.id !== task.method) invalid('案例与研究版本不匹配', [], 503);
    return {...task, record};
  }));
  const answers=(store.researchByIds?await store.researchByIds(item.qaRecordIds||[]):await store.researches?.()||[]).filter(r=>r.caseId===id&&item.qaRecordIds?.includes(r.id));
  return {...item, sources, tasks: records, qaRecords:answers, evidenceStatus: sources.every(s => s.verification === 'matched') ? 'matched' : 'needs-review'};
}

export async function listCases(dir, store, repo) {
  let files;
  try { files = await fs.readdir(path.join(dir, 'strategy-cases')); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const cases = [];
  for (const file of files.filter(f => f.endsWith('.json') && validId(f.slice(0, -5))).sort()) {
    try {
      const c = await readCase(dir, file.slice(0, -5), store, repo);
      cases.push({kind:c.kind||null,recommendationId:c.recommendationId||null,id: c.id, title: c.title, subtitle: c.subtitle, templateId: c.templateId, topic: c.topic, evidenceStatus: c.evidenceStatus});
    } catch (e) {
      // An unavailable case must not take down the existing research catalogue.
      console.error(JSON.stringify({event: 'strategy.case-unavailable', caseId: file.slice(0, -5), code: e.code || e.name}));
    }
  }
  return cases;
}
