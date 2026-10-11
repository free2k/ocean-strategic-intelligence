// Run under the existing maintenance lock with the intelligence process stopped.
import fs from 'node:fs/promises';import path from 'node:path';import {Store} from './store.mjs';import {mergeProcessedSnapshot} from './auto-extract.mjs';
const dir=process.env.INTEL_DATA_DIR,stage=process.env.OPEN_DATA_STAGE;if(!dir||!stage)throw Error('Explicit data and stage directories required');
const incoming=JSON.parse(await fs.readFile(path.join(stage,'snapshot.json'),'utf8'));
if(!incoming.sources.some(s=>s.id==='fr-boem'&&s.status==='ready')||!incoming.series?.length)throw Error('No validated official data');
const allowed=new Set(['fr-boem','sodir-production','uk-repd','boem-news','boem-policy']);if(incoming.sources.some(s=>!allowed.has(s.id)))throw Error('Unexpected staged source');
const store=new Store(dir,process.env.INTEL_DATABASE_URL||process.env.DATABASE_URL);try{await store.init();
 await fs.writeFile(path.join(dir,`before-open-datasets-${Date.now()}.json`),JSON.stringify(store.data),{mode:0o600});
 const next=mergeProcessedSnapshot(store.data,incoming);next.assetRegistries={...store.data.assetRegistries,...incoming.assetRegistries};next.errors=[...(store.data.errors||[]).filter(e=>!allowed.has(e.sourceId)),...(incoming.errors||[])];
 for(const f of await fs.readdir(stage))if(/^(official-|ver_)/.test(f)&&/\.(json|csv|html)$/.test(f))await fs.copyFile(path.join(stage,f),path.join(dir,f));
 await store.import(next);console.log(JSON.stringify({published:incoming.sources.map(s=>({id:s.id,status:s.status,records:s.records,newDocuments:s.newDocuments})),totalDocuments:next.documents.length,totalSeries:next.series.length}));
}finally{await store.pool?.end();}
