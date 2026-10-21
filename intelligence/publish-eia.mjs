import {readSnapshot} from './snapshot-reader.mjs';
import {changedRowsBackup,saveChangeBackup} from './change-backup.mjs';
// Independent maintenance writer; the website follows committed row revisions.
import fs from 'node:fs/promises';
import path from 'node:path';
import {Store} from './store.mjs';
import {mergeEia} from './eia.mjs';
const dir=process.env.INTEL_DATA_DIR;
if(!dir || !process.env.EIA_STAGE_DIR) throw new Error('Explicit production and staging directories required');
const candidate=await readSnapshot(path.join(process.env.EIA_STAGE_DIR,'snapshot.json'));
const series=candidate.series?.find(s=>s.id==='eia-offshore-crude');
if(!series?.rows?.length) throw new Error('Missing staged EIA series');
const store=new Store(dir,process.env.INTEL_DATABASE_URL||process.env.DATABASE_URL);
try {
  await store.init();
  const backupDir=path.join(dir,'eia-publish-backups');
  await fs.mkdir(backupDir,{recursive:true});
  await saveChangeBackup(backupDir,'series',changedRowsBackup(store.data,{series:[series],sources:[{id:'eia'}]}));
  // Read latest database state, not the older staging copy, to preserve edits.
  await store.import(mergeEia(store.data,series));
  console.log(JSON.stringify({published:true,backend:store.backend,rows:series.rows.length,latest:series.rows.at(-1).period}));
} finally { await store.pool?.end(); }
