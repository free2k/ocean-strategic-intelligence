import fs from 'node:fs/promises';import path from 'node:path';
import {Store} from './store.mjs';import {mergeNews} from './eia-news.mjs';
const dir=process.env.INTEL_DATA_DIR,stage=process.env.EIA_NEWS_STAGE_DIR;
if(!dir||!stage)throw new Error('Explicit directories required');
const incoming=JSON.parse(await fs.readFile(path.join(stage,'incoming.json'),'utf8'));
const store=new Store(dir,process.env.INTEL_DATABASE_URL||process.env.DATABASE_URL);
try{await store.init();const backup=path.join(dir,'eia-publish-backups');await fs.mkdir(backup,{recursive:true});await fs.writeFile(path.join(backup,'news-'+Date.now()+'.json'),JSON.stringify(store.data),{mode:0o600});
for(const d of incoming.documents)await fs.copyFile(path.join(stage,d.versionId+'.html'),path.join(dir,d.versionId+'.html'));
await store.import(mergeNews(store.data,incoming));console.log(JSON.stringify({published:true,newDocuments:incoming.documents.length,totalDocuments:store.data.documents.length}));
}finally{await store.pool?.end();}
