import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fail} from './ledger.mjs';
const empty=()=>({tasks:{},reservations:{},days:{},budget:null});
// Shared by every worker using this directory. Never steal an uncertain crash-held lock.
export class FileRuntimeState{
 constructor(dir){this.dir=dir;}
 // Writers replace runtime.json atomically; progress reads need no write lock
 // and must not force disk flushes behind a large background artifact write.
 async read(){try{return JSON.parse(await fs.readFile(path.join(this.dir,'runtime.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return empty();throw error;}}
 async transact(change){
  await fs.mkdir(this.dir,{recursive:true});let lock;
  try{lock=await fs.open(path.join(this.dir,'runtime.lock'),'wx');}catch(e){if(e.code==='EEXIST')fail('SHARED_STATE_BUSY','共享调度状态忙，请稍后重试',409);throw e;}
  const file=path.join(this.dir,'runtime.json'),tmp=file+'.'+randomUUID()+'.tmp';
  try{let state;try{state=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state=empty();}
   const result=await change(state);const h=await fs.open(tmp,'wx',0o600);try{await h.writeFile(JSON.stringify(state));await h.sync();}finally{await h.close();}await fs.rename(tmp,file);return result;
  }finally{await fs.rm(tmp,{force:true});await lock.close();await fs.unlink(path.join(this.dir,'runtime.lock'));}
 }
}
// Explicit schema migration required. The row lock spans all services using this database.
export class PostgresRuntimeState{
 constructor(pool){this.pool=pool;}
 async transact(change){const c=await this.pool.connect();try{await c.query('BEGIN');await c.query("INSERT INTO ocean_research.runtime(id,payload) VALUES('shared',$1) ON CONFLICT DO NOTHING",[empty()]);const state=(await c.query("SELECT payload FROM ocean_research.runtime WHERE id='shared' FOR UPDATE")).rows[0].payload;const result=await change(state);await c.query("UPDATE ocean_research.runtime SET payload=$1 WHERE id='shared'",[state]);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
}
