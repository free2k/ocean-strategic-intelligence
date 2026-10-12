import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base='http://127.0.0.1:3000';
const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:process.env.SITE_PASSWORD})});
assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
const get=async path=>{const r=await fetch(base+path,{headers:{cookie}});assert.equal(r.status,200);return r.json();};
const d=await get('/api/subscriptions/discovery');assert.equal(d.configured,true);
assert.equal((await fetch(base+'/api/subscriptions/discovery')).status,401);
if(process.argv.includes('--queue')){const r=await fetch(base+'/api/subscriptions/batch',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({action:'discover',names:['中国能源报'],autoSubscribe:true})});assert.equal(r.status,200);console.log({queued:await r.json()});}
if(process.argv.includes('--session')){const i=cookie.indexOf('=');await fs.writeFile('/opt/knowledge-base/discovery-test-session.json',JSON.stringify({cookies:[{name:cookie.slice(0,i),value:cookie.slice(i+1),domain:'49.233.77.111',path:'/',httpOnly:true,secure:false,sameSite:'Lax'}],origins:[]}),{mode:0o600});}
console.log(JSON.stringify({configured:d.configured,model:d.model,jobs:d.jobs.map(j=>({id:j.id,status:j.status,completed:j.result?.discovery?.length,error:j.error})),results:d.results.map(r=>({name:r.name,status:r.status,reason:r.reason}))}));
