import assert from 'node:assert/strict';
const base='http://127.0.0.1:3101';
const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:process.env.SITE_PASSWORD})});assert.equal(login.status,200);
const cookie=login.headers.get('set-cookie').split(';')[0];
if(process.argv.includes('--process')){const r=await fetch(base+'/api/process',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,202);console.log('Backfill processing started');}
const r=await fetch(base+'/api/data',{headers:{cookie}});assert.equal(r.status,200);const d=await r.json();if(!d.sourceFunnels){const f=await fetch(base+'/api/source-funnels',{headers:{cookie}});assert.equal(f.status,200);d.sourceFunnels=await f.json();}assert.ok(d.sourceFunnels);
for(const f of Object.values(d.sourceFunnels)){assert.equal(f.collected,f.included+f.candidate+f.excluded+f.pending);assert.equal(typeof f.analysisPending,'number');}
console.log(JSON.stringify({collection:d.collection,processing:d.processing,funnels:Object.fromEntries(Object.entries(d.sourceFunnels).filter(([id])=>['mp2rss_mp:3299105144','mp2rss_mp:3091110512','mp2rss_mp:3099863021','mp2rss_mp:3010302962'].includes(id)))}));
