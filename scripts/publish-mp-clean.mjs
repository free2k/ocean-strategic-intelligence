import fs from 'node:fs/promises';import path from 'node:path';
import {Store} from '../intelligence/store.mjs';import {mergeProcessedSnapshot} from '../intelligence/auto-extract.mjs';
const dir='/opt/ocean-intelligence/data',stage=path.join(dir,'jobs','1791721669811'),store=new Store(dir,process.env.DATABASE_URL);
try{await store.init();const candidate=JSON.parse(await fs.readFile(path.join(stage,'snapshot.json')));if(candidate.documents.filter(x=>x.cleaning).length!==49||candidate.documents.some(x=>x.cleaning&&(!x.autoExtraction||x.autoExtraction.status==='running')))throw Error('Incomplete recovery checkpoint');
 await store.import(mergeProcessedSnapshot(store.data,candidate));
 for(const f of await fs.readdir(stage))if(/\.(html|pdf|json|csv)$/.test(f)&&f!=='snapshot.json')await fs.copyFile(path.join(stage,f),path.join(dir,f));
 const state=JSON.parse(await fs.readFile(path.join(dir,'collection-status.json')));Object.assign(state,{running:false,currentStep:null,lastRun:new Date().toISOString(),documents:store.data.documents.length,result:'partial',error:null});await fs.writeFile(path.join(dir,'collection-status.json'),JSON.stringify(state));console.log(JSON.stringify({published:store.data.documents.length,cleaned:49}));
}finally{await store.pool?.end();}
