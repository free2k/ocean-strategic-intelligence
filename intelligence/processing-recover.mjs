import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import {execFileSync} from 'node:child_process';
import {createLiveProcessing,acquireProcessingGuard} from './processing-live.mjs';
import {Store} from './store.mjs';
const taskId=process.argv[2];if(!/^[a-f0-9-]{36}$/.test(taskId||'')||!process.argv.includes('--apply'))throw Error('Usage: processing-recover.mjs TASK_UUID --apply');
const dir=process.env.INTEL_DATA_DIR||'/opt/ocean-intelligence/data';
const url=process.env.INTEL_DATABASE_URL||process.env.DATABASE_URL;
const pool=new pg.Pool({connectionString:url,max:2});let release,stopped=false;
try{
 const until=Date.now()+15*60*1000;let reported=false;
 while(!release){try{release=await acquireProcessingGuard(pool);}catch(e){if(e.status!==409||Date.now()>until)throw e;if(!reported){console.log(JSON.stringify({stage:'waiting',message:e.message}));reported=true;}await new Promise(r=>setTimeout(r,3000));}}
 const stateFile=path.join(dir,'processing-runs/tasks/runtime.json'),state=JSON.parse(await fs.readFile(stateFile,'utf8'));
 if(Object.values(state.processingRuns||{}).some(t=>['running','queued','stopping'].includes(t.status)))throw Error('Another manual task is active; recovery deferred');
 const task=state.processingRuns?.[taskId];if(!task)throw Error('Task not found');if(task.publication){console.log(JSON.stringify({stage:'already_published',publication:task.publication}));process.exitCode=0;}
 else{
  execFileSync('pm2',['stop','ocean-intelligence'],{stdio:'ignore'});stopped=true;
  const backup=path.join(dir,'processing-runs','recovery-backups',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(backup,{recursive:true});await fs.copyFile(stateFile,path.join(backup,'runtime.json'));
  const store=new Store(dir,url);await store.init();await fs.writeFile(path.join(backup,'workspace.json'),JSON.stringify(store.data));
  console.log(JSON.stringify({stage:'merging',taskId,backup}));
  const manager=await createLiveProcessing({dir,store,serial:fn=>fn(),client:null,auditPool:pool});
  const publication=await manager.resumePublication(taskId);
  console.log(JSON.stringify({stage:'published',publication}));
 }
}catch(e){console.error(JSON.stringify({stage:'failed',code:e.code,message:e.message,table:e.table,column:e.column,stack:e.stack?.split('\n').slice(0,6)}));process.exitCode=1;
}finally{if(stopped)execFileSync('pm2',['restart','ocean-intelligence'],{stdio:'ignore'});await release?.();await pool.end();process.exit(process.exitCode||0);}
