import fs from 'node:fs/promises';
const before='subscriptions:(subs.list||[]).map(',after='subscriptions:(subs.list||[]).filter(s=>s.present!==false).map(';
for(const base of ['/opt/ocean-intelligence/current','/opt/knowledge-base','/opt/knowledge-base/subscription-batch-stage']){
const file=base+'/intelligence/public/sensing.js';let text;try{text=await fs.readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')continue;throw e;}
if(text.includes(after)){console.log('Already patched: '+base);continue;}
if(!text.includes(before))throw Error('Unexpected source: '+base);
await fs.copyFile(file,file+'.before-active-'+Date.now());
await fs.writeFile(file+'.active.tmp',text.replace(before,after));await fs.rename(file+'.active.tmp',file);console.log('Patched: '+base);
}
