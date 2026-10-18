// These are selection aids drawn from the current evidence scope, not new facts.
export function buildInputOptions(raw, catalog, dictionary, relationTypes) {
  const docs = (catalog.documents || []).filter(d => d.classification?.status === 'accepted');
  const docIds = new Set(docs.map(d => d.id));
  const evidenceDocs = new Map((raw.evidence || []).map(e => [e.id, e.documentId]));
  const objects = new Map();
  const addObject = (name, type = '平台对象') => {
    if (typeof name === 'string' && name.trim() && name.length <= 300 && !objects.has(name)) objects.set(name, {name, type});
  };
  for (const e of raw.entities || []) if (e.evidenceIds?.some(id => docIds.has(evidenceDocs.get(id)))) addObject(e.nameZh || e.name, e.type);
  for (const r of Object.values(catalog.registries || {})) for (const row of r.rows || []) addObject(row.project, '登记项目');
  for (const row of catalog.officialRecords || []) if (row['分类'] === '纳入') addObject(row['对象'], '官方登记对象');
  const references = new Map();
  const addRef = (url, title, kind) => {
    if (/^https?:\/\//i.test(url || '') && !references.has(url)) references.set(url, {url, title: title || url, kind});
  };
  for (const d of docs) addRef(d.url, d.title, '原文资料');
  for (const s of catalog.series || []) addRef(s.sourceUrl, s.name, '统计原表');
  for (const r of Object.values(catalog.registries || {})) addRef(r.sourceUrl, r.name, '官方登记');
  for (const r of catalog.datasetVersions || []) addRef(r.url, r.filename || r.name, '原始工作簿');
  const indicators = new Map(dictionary.indicators.map(i => [i.name, {name: i.name, definition: i.unitOrDefinition + '；' + i.interpretation, kind: '指标词典建议'}]));
  for (const s of catalog.series || []) indicators.set(s.name, {name: s.name, definition: s.note || '保留原表定义与统计范围', unit: s.unit, frequency: s.frequency, kind: '平台统计指标'});
  const units = [...new Set([...(catalog.series || []).map(s => s.unit), ...(catalog.observations || []).filter(o => o.included).map(o => o.unit)])].filter(v => typeof v === 'string' && v.trim() && v.length <= 120);
  return {objects: [...objects.values()], references: [...references.values()], indicators: [...indicators.values()], units, relationTypes,
    note: '选项只帮助定位已有对象、指标和出处；选择名称不表示数值已填入或完成核定。'};
}
