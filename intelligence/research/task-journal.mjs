import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fail} from './ledger.mjs';

const valid=id=>/^task_[0-9a-f-]{36}$/.test(id);
const states=new Set(['queued','collecting','body_preparation','classifying','structuring','ready_to_publish','published','partial','failed','deferred']);
const terminal=new Set(['published','partial','failed']);
async function read(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function atomic(file,data){const tmp=file+'.'+randomUUID()+'.tmp';try{const h=await fs.open(tmp,'wx',0o600);try{await h.writeFile(JSON.stringify(data));await h.sync();}finally{await h.close();}await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true});}}

// A durable journal on the existing persistent data volume. Each mutation uses a per-task
// exclusive lock and expected revision. No automatic stale-lock stealing after a crash.
export class TaskJournal{
 constructor(dir){this.dir=dir;}
 file(id){if(!valid(id))fail('INVALID_TASK_ID','Invalid processing task ID');return path.join(this.dir,id+'.json');}
 async get(id){const task=await read(this.file(id));if(!task)fail('TASK_NOT_FOUND','Processing task does not exist',404);return task;}
 async create({trigger,expectedReleaseId}){await fs.mkdir(this.dir,{recursive:true});const now=new Date().toISOString(),task={id:'task_'+randomUUID(),revision:0,trigger,expectedReleaseId,status:'queued',createdAt:now,updatedAt:now,steps:[],errors:[],upstreamTaskIds:[],upstreamProvenance:'not_recorded',history:[{status:'queued',at:now}]};await atomic(this.file(task.id),task);return task;}
 async update(id,revision,patch){
  const file=this.file(id);let lock;try{lock=await fs.open(file+'.lock','wx');}catch(e){if(e.code==='EEXIST')fail('TASK_BUSY','Processing task is being updated',409);throw e;}
  try{const task=await this.get(id);if(task.revision!==revision)fail('TASK_VERSION_CONFLICT','Processing task changed',409);if(patch.status&&!states.has(patch.status))fail('INVALID_TASK_STATE','Unknown processing stage');if(terminal.has(task.status)&&patch.status&&patch.status!==task.status)fail('TASK_FINALIZED','Completed task cannot be restarted',409);
   const {id:ignoredId,revision:ignoredRevision,createdAt:ignoredCreated,history:ignoredHistory,...safe}=patch;
   const now=new Date().toISOString(),next={...task,...safe,revision:revision+1,updatedAt:now,history:patch.status&&patch.status!==task.status?[...task.history,{status:patch.status,at:now,reason:patch.reason||null}]:task.history};await atomic(file,next);return next;
  }finally{await lock.close();await fs.unlink(file+'.lock');}
 }
 async checkpoint(id,data){await this.get(id);const file=path.join(this.dir,id+'.checkpoint.json');const h=await fs.open(file,'wx',0o600);try{await h.writeFile(JSON.stringify(data));await h.sync();}finally{await h.close();}}
 async readCheckpoint(id){await this.get(id);const value=await read(path.join(this.dir,id+'.checkpoint.json'));if(!value)fail('CHECKPOINT_MISSING','Publication checkpoint is unavailable',409);return value;}
 async list({limit=20,cursor=null,status=null}={}){
  limit=Number(limit);if(!Number.isInteger(limit)||limit<1||limit>100)fail('INVALID_LIMIT','limit must be between 1 and 100');if(status&&!states.has(status))fail('INVALID_TASK_STATE','Unknown processing stage');
  let boundary=null;if(cursor){try{boundary=JSON.parse(Buffer.from(cursor,'base64url').toString());if(typeof boundary.at!=='string'||!valid(boundary.id)||!Number.isFinite(Date.parse(boundary.at)))throw Error();}catch{fail('INVALID_CURSOR','Invalid batch cursor');}}
  let names;try{names=await fs.readdir(this.dir);}catch(e){if(e.code==='ENOENT')return {data:[],nextCursor:null};throw e;}
  const tasks=[];for(const name of names)if(/^task_[0-9a-f-]{36}\.json$/.test(name)){const t=await read(path.join(this.dir,name));if(t&&(!status||t.status===status)&&(!boundary||t.createdAt<boundary.at||t.createdAt===boundary.at&&t.id<boundary.id))tasks.push(t);}
  tasks.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));const page=tasks.slice(0,limit),last=page.at(-1);return {data:page,nextCursor:tasks.length>limit?Buffer.from(JSON.stringify({at:last.createdAt,id:last.id})).toString('base64url'):null};
 }
}
