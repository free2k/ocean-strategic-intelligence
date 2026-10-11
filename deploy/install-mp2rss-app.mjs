import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const root='/opt/knowledge-base',stamp=Date.now();
const staged=root+'/.mp2-output-stage/.output',live=root+'/.output',backup=root+'/.output.before-mp2-'+stamp;
if(!fs.existsSync(staged+'/server/index.mjs'))throw Error('Staged build missing');
const envFile=root+'/.env',credentials=fs.readFileSync(root+'/mp2rss.env','utf8');const line=credentials.split('\n').find(x=>x.startsWith('MP2_RSS_LINK='));if(!line)throw Error('Provider configuration missing');
fs.copyFileSync(envFile,root+'/.env.before-mp2-'+stamp);fs.chmodSync(root+'/.env.before-mp2-'+stamp,0o600);
const original=fs.readFileSync(envFile,'utf8');fs.writeFileSync(envFile,original.replace(/^MP2_RSS_LINK=.*\r?\n?/gm,'')+'\n'+line+'\n',{mode:0o600});fs.chmodSync(envFile,0o600);
// Override build-time defaults with the production settings without printing them.
for(const key of ['DATABASE_URL','SITE_PASSWORD','OPENAI_API_KEY','OPENAI_BASE_URL','EMBEDDING_MODEL','CHAT_MODEL','EMBEDDING_DIMENSION','SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','SMTP_FROM'])if(process.env[key])process.env['NUXT_'+key]=process.env[key];
process.env.MP2_RSS_LINK=line.slice('MP2_RSS_LINK='.length);
execFileSync('pm2',['stop','knowledge-base'],{stdio:'ignore'});let moved=false;
try{fs.renameSync(live,backup);moved=true;fs.renameSync(staged,live);execFileSync('pm2',['restart','knowledge-base','--update-env'],{stdio:'ignore'});
 let ok=false;for(let n=0;n<20;n++){await new Promise(r=>setTimeout(r,1000));try{const r=await fetch('http://127.0.0.1:3000/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:process.env.SITE_PASSWORD})});if(r.ok){const cookie=r.headers.get('set-cookie')?.split(';')[0];const s=await fetch('http://127.0.0.1:3000/api/subscriptions',{headers:{cookie}});const d=await s.json();if(s.ok&&d.configured&&d.list?.length){ok=true;console.log(JSON.stringify({subscriptions:d.list.length,bridge:d.bridge}));break;}}}catch{}}
 if(!ok)throw Error('Application health validation failed');execFileSync('pm2',['save'],{stdio:'ignore'});console.log('Subscription management deployed; old output retained at '+backup);
}catch{if(moved){if(fs.existsSync(live))fs.renameSync(live,root+'/.output.failed-mp2-'+stamp);fs.renameSync(backup,live);}execFileSync('pm2',['restart','knowledge-base'],{stdio:'ignore'});console.error('Deployment rolled back');process.exitCode=1;}
