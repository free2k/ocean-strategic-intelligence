import fs from 'node:fs/promises';import path from 'node:path';
const dir='/opt/ocean-intelligence/data',state=JSON.parse(await fs.readFile(path.join(dir,'collection-status.json'))),jobs=(await fs.readdir(path.join(dir,'jobs'))).sort();
const d=JSON.parse(await fs.readFile(path.join(dir,'jobs',jobs.at(-1),'snapshot.json')));
console.log(JSON.stringify({running:state.running,step:state.currentStep,documents:d.documents.length,cleaned:d.documents.filter(x=>x.cleaning).length,statuses:d.documents.filter(x=>x.cleaning).reduce((a,x)=>(a[x.autoExtraction?.status||'pending']=(a[x.autoExtraction?.status||'pending']||0)+1,a),{}),reclassified:d.documents.filter(x=>x.sourceId==='mp2rss_mp:3299105144').length}));
console.log(JSON.stringify(d.documents.filter(x=>x.autoExtraction?.status==='running').map(x=>({title:x.title,length:x.content.length,startedAt:x.autoExtraction.startedAt}))));
