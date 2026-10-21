// Resource-limited systemd service. This process never serves public pages.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,timingSafeEqual} from 'node:crypto';
import pg from 'pg';
import OpenAI from 'openai';
import {Store} from './store.mjs';
import {createScheduler} from './scheduler.mjs';
import {createLiveProcessing} from './processing-live.mjs';
import {serveProcessingRuns} from './processing-runs.mjs';
import {ResearchLedger} from './research/ledger.mjs';
import {PostgresResearchRepository} from './research/repositories.mjs';

process.env.INTEL_DATABASE_URL||=process.env.DATABASE_URL;
process.env.INTEL_PROCESSING_WORKER='true';
const root=path.dirname(fileURLToPath(import.meta.url)),dir=process.env.INTEL_DATA_DIR;
if(!dir||!process.env.INTEL_DATABASE_URL||!process.env.SITE_PASSWORD)throw Error('Processing service configuration missing');
const secret=createHash('sha256').update('processing-worker:'+process.env.SITE_PASSWORD).digest('hex');
const store=new Store(dir,process.env.INTEL_DATABASE_URL);await store.init();
// The remote-mode website no longer owns this task directory. A session lock
// gives it exactly one worker owner and is released by PostgreSQL on a crash.
const ownership=await store.pool.connect();
if(!(await ownership.query('SELECT pg_try_advisory_lock(73201930) AS held')).rows[0].held)throw Error('Processing worker already active');
await fs.rm(path.join(dir,'processing-runs','tasks','runtime.lock'),{force:true});
let pending=Promise.resolve();const serial=fn=>{const p=pending.then(fn);pending=p.catch(()=>{});return p;};
const auditPool=process.env.INTEL_AUDIT_DATABASE_URL?new pg.Pool({connectionString:process.env.INTEL_AUDIT_DATABASE_URL,max:2}):store.pool;
const client=process.env.INTEL_ENABLE_AI==='true'&&process.env.OPENAI_API_KEY?new OpenAI({apiKey:process.env.OPENAI_API_KEY,baseURL:process.env.OPENAI_BASE_URL,timeout:75000,maxRetries:0}):null;
const researchLedger=process.env.INTEL_RESEARCH_CAPTURE==='true'?new ResearchLedger(new PostgresResearchRepository(store.pool)):null;
const scheduler=await createScheduler({store,dir,root,serial,researchLedger});
const manager=client?await createLiveProcessing({dir,store,serial,client,auditPool}):null;
const send=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
http.createServer(async(req,res)=>{
 try{
  const token=Buffer.from(req.headers['x-processing-token']||'');
  if(token.length!==secret.length||!timingSafeEqual(token,Buffer.from(secret)))return send(res,401,{error:'Unauthorized'});
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/status'&&req.method==='GET')return send(res,200,{...scheduler.status(),workerPid:process.pid,manualRunning:!!manager?.workers.size});
  if(url.pathname==='/run'&&req.method==='POST'){
   if(scheduler.status().running||manager?.workers.size)return send(res,409,{error:'处理任务正在运行'});
   if(Date.parse(scheduler.status().retryAt||'')>Date.now())return send(res,409,{error:'任务等待重试',retryAt:scheduler.status().retryAt});
   void scheduler.run({processOnly:url.searchParams.get('mode')==='processing'});
   return send(res,202,{accepted:true});
  }
  if(url.pathname.startsWith('/api/processing-runs')&&(url.pathname.endsWith('/start')||url.pathname.endsWith('/preview'))&&scheduler.status().running)return send(res,409,{error:'采集任务正在运行'});
  if(await serveProcessingRuns(req,res,url,manager))return;
  return send(res,404,{error:'Not found'});
 }catch(error){console.error('processing request:',error.code||error.name);send(res,error.status||503,{error:'后台处理暂不可用，请稍后重试'});}
}).listen(Number(process.env.INTEL_PROCESSING_PORT||3105),'127.0.0.1',()=>console.log('Processing worker ready'));
