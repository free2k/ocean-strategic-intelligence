import {readSnapshot} from './snapshot-reader.mjs';
import {changedRowsBackup,saveChangeBackup} from './change-backup.mjs';
import fs from 'node:fs/promises';import path from 'node:path';
import {Store} from './store.mjs';import {mergeNews} from './eia-news.mjs';
const dir=process.env.INTEL_DATA_DIR,stage=process.env.EIA_NEWS_STAGE_DIR;
if(!dir||!stage)throw new Error('Explicit directories required');
const incoming=await readSnapshot(path.join(stage,'incoming.json'));
const store=new Store(dir,process.env.INTEL_DATABASE_URL||process.env.DATABASE_URL);
try{await store.init();const backup=path.join(dir,'eia-publish-backups');await fs.mkdir(backup,{recursive:true});await saveChangeBackup(backup,'news',changedRowsBackup(store.data,incoming,{updatedFields:['sources','entities']}));
for(const d of incoming.documents)await fs.copyFile(path.join(stage,d.versionId+'.html'),path.join(dir,d.versionId+'.html'));
await store.import(mergeNews(store.data,incoming));console.log(JSON.stringify({published:true,newDocuments:incoming.documents.length,totalDocuments:store.data.documents.length}));
}finally{await store.pool?.end();}
