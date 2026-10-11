// Operator runs only while the intelligence process is stopped and maintenance lock held.
import fs from 'node:fs/promises';import path from 'node:path';
import {Store} from './store.mjs';import {profiles} from './expanded-sources.mjs';import {mergeRecords} from './core.mjs';
const dir=process.env.INTEL_DATA_DIR,stage=process.env.EXPANDED_STAGE_DIR;
if(!dir||!stage)throw Error('Explicit stage and production paths required');
const incoming=JSON.parse(await fs.readFile(path.join(stage,'snapshot.json'),'utf8'));
const sourceIds=new Set(profiles.map(s=>s.id));const docs=incoming.documents.filter(d=>sourceIds.has(d.sourceId));const ids=new Set(docs.map(d=>d.id));
if(!docs.length)throw Error('No validated documents to publish');
const store=new Store(dir,process.env.INTEL_DATABASE_URL||process.env.DATABASE_URL);
try{await store.init();const before=store.data;await fs.mkdir(path.join(dir,'expansion-backups'),{recursive:true});await fs.writeFile(path.join(dir,'expansion-backups',Date.now()+'.json'),JSON.stringify(before),{mode:0o600});
const next={...before,generatedAt:new Date().toISOString(),documents:[...before.documents.filter(d=>!ids.has(d.id)),...docs],sources:[...before.sources.filter(s=>!sourceIds.has(s.id)),...incoming.sources.filter(s=>sourceIds.has(s.id))],errors:[...(before.errors||[]).filter(e=>!sourceIds.has(e.sourceId)),...(incoming.errors||[]).filter(e=>sourceIds.has(e.sourceId))],assetRegistries:{...before.assetRegistries,...incoming.assetRegistries}};
for(const k of ['events','relations','observations','evidence'])next[k]=[...before[k].filter(x=>!ids.has(x.documentId)),...incoming[k].filter(x=>ids.has(x.documentId))];
const evidenceIds=new Set(next.evidence.filter(e=>ids.has(e.documentId)).map(e=>e.id));next.entities=mergeRecords([...before.entities,...incoming.entities.filter(e=>e.evidenceIds.some(id=>evidenceIds.has(id)))]);
for(const d of docs)await fs.copyFile(path.join(stage,d.versionId+'.html'),path.join(dir,d.versionId+'.html'));
await store.import(next);console.log(JSON.stringify({published:docs.length,total:next.documents.length,sources:next.sources.filter(s=>sourceIds.has(s.id)).map(s=>({id:s.id,status:s.status}))}));
}finally{await store.pool?.end();}
