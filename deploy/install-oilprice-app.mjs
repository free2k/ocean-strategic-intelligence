import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const root='/opt/knowledge-base',stamp=Date.now();
const staged=root+'/.oilprice-output-stage/.output',live=root+'/.output',backup=root+'/.output.before-oilprice-'+stamp;
if(!fs.existsSync(staged+'/server/index.mjs'))throw Error('Staged build missing');
// Override build-time defaults with the production settings without printing them.
for(const key of ['DATABASE_URL','SITE_PASSWORD','OPENAI_API_KEY','OPENAI_BASE_URL','EMBEDDING_MODEL','CHAT_MODEL','EMBEDDING_DIMENSION','SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','SMTP_FROM'])if(process.env[key])process.env['NUXT_'+key]=process.env[key];

execFileSync('pm2',['stop','knowledge-base'],{stdio:'ignore'});let moved=false;
try{fs.renameSync(live,backup);moved=true;fs.renameSync(staged,live);execFileSync('pm2',['restart','knowledge-base','--update-env'],{stdio:'ignore'});
 let ok=false;for(let n=0;n<20;n++){await new Promise(r=>setTimeout(r,1000));try{const r=await fetch('http://127.0.0.1:3000/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:process.env.SITE_PASSWORD})});if(r.ok){const cookie=r.headers.get('set-cookie')?.split(';')[0];const s=await fetch('http://127.0.0.1:3000/api/subscriptions',{headers:{cookie}});const d=await s.json();if(s.ok&&d.configured&&d.list?.length){ok=true;console.log(JSON.stringify({subscriptions:d.list.length,bridge:d.bridge}));break;}}}catch{}}
 if(!ok)throw Error('Application health validation failed');execFileSync('pm2',['save'],{stdio:'ignore'});console.log('Subscription management deployed; old output retained at '+backup);
}catch{if(moved){if(fs.existsSync(live))fs.renameSync(live,root+'/.output.failed-oilprice-'+stamp);fs.renameSync(backup,live);}execFileSync('pm2',['restart','knowledge-base'],{stdio:'ignore'});console.error('Deployment rolled back');process.exitCode=1;}
