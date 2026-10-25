import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {originalQuote} from '../source-quote.mjs';

export function validateOfficialBundle(bundle){
 const fields=['sources','documents','events','entities','relations','observations','evidence','series'];
 for(const key of fields){if(!Array.isArray(bundle[key])||new Set(bundle[key].map(r=>r.id)).size!==bundle[key].length)throw Error('INVALID_OFFICIAL_BUNDLE:'+key);}
 if(bundle.documents.length>20000||!bundle.sources.every(s=>s.id.startsWith('official-')&&/^https:\/\//.test(s.url)))throw Error('OFFICIAL_SOURCE_SCOPE_REQUIRED');
 const sources=new Set(bundle.sources.map(s=>s.id)),docs=new Map(bundle.documents.map(d=>[d.id,d])),proofs=new Map(bundle.evidence.map(e=>[e.id,e]));
 for(const d of docs.values())if(!sources.has(d.sourceId)||!d.officialImported||!d.sourceLocator||!d.content||!d.industry?.primary?.startsWith('lc_'))throw Error('INVALID_OFFICIAL_DOCUMENT');
 for(const p of proofs.values())if(!docs.get(p.documentId)?.content.includes(p.quote))throw Error('OFFICIAL_QUOTE_NOT_IN_SOURCE');
 for(const key of ['events','relations','observations'])for(const r of bundle[key])if(!docs.has(r.documentId)||!r.evidenceIds?.length||r.evidenceIds.some(id=>proofs.get(id)?.documentId!==r.documentId))throw Error('OFFICIAL_FACT_WITHOUT_SOURCE');
 for(const s of bundle.series)if(!sources.has(s.sourceId)||s.rows.some(r=>!/^\d{4}$/.test(r.period)||!Number.isFinite(r.value)))throw Error('INVALID_OFFICIAL_SERIES');
 return true;
}
export function mergeOfficialBundle(previous,bundle){
 validateOfficialBundle(bundle);
 const next=structuredClone(previous),sourceIds=new Set(bundle.sources.map(s=>s.id)),replaced=new Set(next.documents.filter(d=>d.officialImported&&sourceIds.has(d.sourceId)).map(d=>d.id));
 const merge=(old,rows)=>[...new Map([...old,...rows].map(r=>[r.id,r])).values()];
 next.sources=merge(next.sources,bundle.sources);
 next.documents=merge(next.documents.filter(d=>!replaced.has(d.id)||d.manual||d.industry?.manual),bundle.documents.map(d=>({...d,industry:{...d.industry,version:previous.industryRuleVersion}})));
 for(const key of ['events','relations','observations','evidence'])next[key]=merge(next[key].filter(r=>!replaced.has(r.documentId)||r.manual||r.reviewedAt),bundle[key]);
 const entityMap=new Map(next.entities.map(e=>[e.id,e]));for(const e of bundle.entities){const old=entityMap.get(e.id);entityMap.set(e.id,old?{...old,...e,evidenceIds:[...new Set([...(old.evidenceIds||[]),...e.evidenceIds])]}:e);}next.entities=[...entityMap.values()];
 next.series=merge((next.series||[]).filter(s=>!s.officialImported||!sourceIds.has(s.sourceId)),bundle.series);
 next.reportCatalog=merge(next.reportCatalog||[],bundle.reportCatalog||[]);
 next.officialData={...next.officialData,...bundle.officialData};
 const docs=new Map(next.documents.map(d=>[d.id,d]));let repairedQuotes=0;
 for(const p of next.evidence){const d=docs.get(p.documentId);if(!d)continue;const quote=originalQuote(d.content,p.quote)||originalQuote(d.contentZh,p.quote);if(quote&&quote!==p.quote){p.normalizedQuoteBeforeRepair=p.quote;p.quote=quote;p.start=(d.content||'').indexOf(quote);p.repairMethod='恢复原文连续片段；仅空白字符差异';repairedQuotes++;}}
 const evidence=new Map(next.evidence.map(e=>[e.id,e]));for(const d of next.documents)if(d.extraction?.evidence)d.extraction.evidence=d.extraction.evidence.map(e=>evidence.get(e.id)||e);
 next.generatedAt=new Date().toISOString();
 return {data:next,repairedQuotes};
}

if(process.argv[1]?.endsWith('/official-import.mjs')){
 const [{Store},{verifyLowCarbonEnvironment},{publishWorkspace},{PostgresResearchRepository}]=await Promise.all([import('../store.mjs'),import('./runtime.mjs'),import('../research/publish-workspace.mjs'),import('../research/repositories.mjs')]);
 await verifyLowCarbonEnvironment();
 const file=process.argv[2];if(!file)throw Error('Official bundle path is required');
 const bytes=await fs.readFile(file);if(bytes.length>100*1024*1024)throw Error('BUNDLE_TOO_LARGE');
 const bundle=JSON.parse(bytes),store=new Store(process.env.INTEL_DATA_DIR,process.env.INTEL_DATABASE_URL);
 try{
  await store.init();const before=Object.fromEntries(['documents','events','observations','series'].map(k=>[k,store.data[k].length]));
  const {data,repairedQuotes}=mergeOfficialBundle(store.data,bundle);
  data.officialData.bundleSha256=createHash('sha256').update(bytes).digest('hex');
  await store.import(data);
  const release=await publishWorkspace(new PostgresResearchRepository(store.pool),store.data,{trigger:'official-source-enrichment',completeness:'complete'});
  console.log(JSON.stringify({before,after:Object.fromEntries(['documents','events','observations','series'].map(k=>[k,store.data[k].length])),repairedQuotes,releaseId:release.releaseId,snapshotId:release.snapshotId,bundleSha256:data.officialData.bundleSha256}));
 }finally{await store.pool?.end();}
}
