import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';import {Store} from './store.mjs';
const dir='/opt/ocean-intelligence/data',stage='/opt/ocean-intelligence/mp2rss-publish-stage';
const store=new Store(dir,process.env.INTEL_DATABASE_URL||process.env.DATABASE_URL);
try{await store.init();await fs.mkdir(stage,{recursive:true});await fs.mkdir(path.join(dir,'mp2rss-backups'),{recursive:true});await fs.writeFile(path.join(dir,'mp2rss-backups',Date.now()+'.json'),JSON.stringify(store.data),{mode:0o600});await fs.writeFile(path.join(stage,'snapshot.json'),JSON.stringify(store.data));
execFileSync(process.execPath,['intelligence/import-mp2rss.mjs'],{env:{...process.env,INTEL_DATA_DIR:stage},stdio:'inherit'});const next=JSON.parse(await fs.readFile(path.join(stage,'snapshot.json'),'utf8'));for(const f of await fs.readdir(stage))if(f.endsWith('.html'))await fs.copyFile(path.join(stage,f),path.join(dir,f));await store.import(next);console.log(JSON.stringify({documents:next.documents.length,mp2rss:next.documents.filter(d=>d.provider==='Mp2RSS').length}));
}finally{await store.pool?.end();}
