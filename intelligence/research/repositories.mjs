import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fail,digest} from './ledger.mjs';
const valid=id=>/^(snapshot|batch|release|product|registry)_[a-f0-9]{64}$/.test(id);
const check=id=>{if(!valid(id))fail('INVALID_ID','Invalid research record ID');return id;};
async function readJson(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}

// Local/isolated backend. Lock is never silently stolen after a crash.
// PostgreSQL is the production backend; a local stale lock requires explicit operator recovery.
export class FileResearchRepository{
 constructor(dir){this.dir=dir;}
 async head(){return readJson(path.join(this.dir,'head.json'));}
 async read(id){return readJson(path.join(this.dir,check(id)+'.json'));}
 async isPublished(id){let head=await this.head();const visited=new Set();while(head&&!visited.has(head.releaseId)){if(head.releaseId===id)return true;visited.add(head.releaseId);const r=await this.read(head.releaseId);if(!r)return false;head=r.previousReleaseId?{releaseId:r.previousReleaseId}:null;}return false;}
 async releaseForSnapshot(id){check(id);let head=await this.head();while(head){const r=await this.read(head.releaseId);if(r.snapshotId===id)return r.releaseId;head=r.previousReleaseId?{releaseId:r.previousReleaseId}:null;}return null;}
 async commit({expectedReleaseId,head,records}){
  await fs.mkdir(this.dir,{recursive:true});let lock;
  try{lock=await fs.open(path.join(this.dir,'publish.lock'),'wx');}catch(e){if(e.code==='EEXIST')fail('PUBLISH_BUSY','Another publication holds the lock',409);throw e;}
  const tmp=path.join(this.dir,`head-${randomUUID()}.tmp`);
  try{
   if(((await this.head())?.releaseId||null)!==expectedReleaseId)fail('VERSION_CONFLICT','Latest release changed',409);
   for(const [id,record] of Object.entries(records)){const file=path.join(this.dir,check(id)+'.json'),existing=await readJson(file);if(existing){if(digest(existing)!==digest(record))fail('IMMUTABLE_CONFLICT','Existing immutable record differs',409);continue;}const stage=file+'.'+randomUUID()+'.tmp';try{const h=await fs.open(stage,'wx');try{await h.writeFile(JSON.stringify(record));await h.sync();}finally{await h.close();}await fs.rename(stage,file);}finally{await fs.rm(stage,{force:true});}}
   const h=await fs.open(tmp,'wx');try{await h.writeFile(JSON.stringify(head));await h.sync();}finally{await h.close();}await fs.rename(tmp,path.join(this.dir,'head.json'));
  }finally{await fs.rm(tmp,{force:true});await lock.close();await fs.unlink(path.join(this.dir,'publish.lock'));}
 }
}

// Schema installation is an explicit migration, never an application-start side effect.
export class PostgresResearchRepository{
 constructor(pool){this.pool=pool;}
 async head(){return (await this.pool.query("SELECT payload FROM ocean_research.head WHERE id='latest'")).rows[0]?.payload||null;}
 async read(id){return (await this.pool.query('SELECT payload FROM ocean_research.records WHERE id=$1',[check(id)])).rows[0]?.payload||null;}
 async isPublished(id){check(id);return (await this.pool.query(`WITH RECURSIVE chain AS (
 SELECT r.id,r.payload,ARRAY[r.id] AS visited FROM ocean_research.head h JOIN ocean_research.records r ON r.id=h.payload->>'releaseId' WHERE h.id='latest'
 UNION ALL SELECT r.id,r.payload,c.visited||r.id FROM chain c JOIN ocean_research.records r ON r.id=c.payload->>'previousReleaseId' WHERE NOT r.id=ANY(c.visited)
 ) SELECT 1 FROM chain WHERE id=$1 LIMIT 1`,[id])).rowCount>0;}
 async releaseForSnapshot(id){check(id);return (await this.pool.query(`WITH RECURSIVE chain AS (
 SELECT r.id,r.payload,ARRAY[r.id] AS visited,0 AS depth FROM ocean_research.head h JOIN ocean_research.records r ON r.id=h.payload->>'releaseId' WHERE h.id='latest'
 UNION ALL SELECT r.id,r.payload,c.visited||r.id,c.depth+1 FROM chain c JOIN ocean_research.records r ON r.id=c.payload->>'previousReleaseId' WHERE NOT r.id=ANY(c.visited)
 ) SELECT id FROM chain WHERE payload->>'snapshotId'=$1 ORDER BY depth LIMIT 1`,[id])).rows[0]?.id||null;}
 async commit({expectedReleaseId,head,records}){
  const c=await this.pool.connect();try{await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ocean_research.publish',0))");
   const current=(await c.query("SELECT payload FROM ocean_research.head WHERE id='latest' FOR UPDATE")).rows[0]?.payload;
   if((current?.releaseId||null)!==expectedReleaseId)fail('VERSION_CONFLICT','Latest release changed',409);
   for(const [id,record] of Object.entries(records)){check(id);const old=(await c.query('SELECT payload FROM ocean_research.records WHERE id=$1',[id])).rows[0]?.payload;if(old){if(digest(old)!==digest(record))fail('IMMUTABLE_CONFLICT','Existing immutable record differs',409);}else await c.query('INSERT INTO ocean_research.records(id,kind,payload) VALUES($1,$2,$3)',[id,record.kind,record]);}
   await c.query("INSERT INTO ocean_research.head(id,payload) VALUES('latest',$1) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload",[head]);await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
}
