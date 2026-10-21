import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {readSnapshot,snapshotEntries} from './snapshot-reader.mjs';
import {writeJsonFile} from './json-stream.mjs';

// A job pins immutable row hashes, not a copy of the working library. Bodies
// are shared between jobs; changed records alone create another object.
export const taskSchemaSql=`
CREATE TABLE IF NOT EXISTS ocean_intel.task_objects(hash text PRIMARY KEY,payload text NOT NULL);
CREATE TABLE IF NOT EXISTS ocean_intel.task_workspaces(
 id text PRIMARY KEY,base_revision text,fields jsonb NOT NULL,generation integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'running',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ocean_intel.task_inputs(
 job_id text NOT NULL REFERENCES ocean_intel.task_workspaces(id) ON DELETE CASCADE,
 field text NOT NULL,key text NOT NULL,position integer NOT NULL,
 hash text NOT NULL REFERENCES ocean_intel.task_objects(hash),base_hash text,deleted boolean NOT NULL DEFAULT false,
 PRIMARY KEY(job_id,field,key));
CREATE INDEX IF NOT EXISTS task_inputs_hash ON ocean_intel.task_inputs(hash);
CREATE INDEX IF NOT EXISTS task_inputs_base_hash ON ocean_intel.task_inputs(base_hash);
CREATE INDEX IF NOT EXISTS workspace_rows_live_hash ON ocean_intel.workspace_rows(hash) WHERE NOT deleted;`;
const digest=text=>createHash('sha256').update(text).digest('hex');
const marker=dir=>path.join(dir,'task-input.json');
const internal=new Set(['_workspaceDelta','_workspaceParts']);
const generations=new Map();
const fieldsOf=data=>Object.fromEntries(Object.entries(data).filter(([k,v])=>!internal.has(k)&&v!==undefined).map(([k,v])=>[k,Array.isArray(v)]));
const databaseUrl=()=>process.env.INTEL_DATABASE_URL||process.env.DATABASE_URL;
async function connection(fn){const pool=new pg.Pool({connectionString:databaseUrl(),max:1});try{return await fn(pool);}finally{await pool.end();}}
async function manifest(dir){try{const m=JSON.parse(await fs.readFile(marker(dir),'utf8'));if(m.version!==1||m.id!==path.basename(dir))throw Error('Invalid task input manifest');return m;}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function createTaskWorkspace(pool,data,dir){
 if(!pool){await writeJsonFile(path.join(dir,'snapshot.json'),data);return;}
 await pool.query(taskSchemaSql);
 const client=await pool.connect(),id=path.basename(dir),fields=fieldsOf(data);
 await fs.writeFile(marker(dir),JSON.stringify({version:1,id,baseRevision:data._workspaceDelta?.revision,storage:'postgres-article-versions'}));
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  const head=(await client.query("SELECT payload FROM ocean_intel.runs WHERE id='current'")).rows[0]?.payload;
  if(!head?._workspaceDelta||head._workspaceDelta.revision!==data._workspaceDelta?.revision)throw Error('Task input workspace revision changed');
  await client.query('INSERT INTO ocean_intel.task_workspaces(id,base_revision,fields) VALUES($1,$2,$3)',[id,head._workspaceDelta.revision,fields]);
  // Server-side copy only previously unseen content; later jobs reuse hashes.
  await client.query(`INSERT INTO ocean_intel.task_objects(hash,payload)
   SELECT w.hash,w.payload FROM ocean_intel.workspace_rows w WHERE NOT w.deleted
    AND NOT EXISTS(SELECT 1 FROM ocean_intel.task_objects o WHERE o.hash=w.hash)
   ON CONFLICT(hash) DO NOTHING`);
  await client.query(`INSERT INTO ocean_intel.task_inputs(job_id,field,key,position,hash,base_hash)
   SELECT $1,field,key,position,hash,hash FROM ocean_intel.workspace_rows WHERE NOT deleted`,[id]);
  for(const [field,array] of Object.entries(fields))if(!array){
   const payload=JSON.stringify(data[field]),hash=digest(payload);
   await client.query('INSERT INTO ocean_intel.task_objects(hash,payload) VALUES($1,$2) ON CONFLICT DO NOTHING',[hash,payload]);
   await client.query('INSERT INTO ocean_intel.task_inputs(job_id,field,key,position,hash,base_hash) VALUES($1,$2,$3,0,$4,$4)',[id,field,'@meta',hash]);
  }
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export async function* taskEntries(dir){
 const m=await manifest(dir);
 if(!m){yield* snapshotEntries(path.join(dir,'snapshot.json'));return;}
 const pool=new pg.Pool({connectionString:databaseUrl(),max:1}),client=await pool.connect();
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const task=(await client.query('SELECT * FROM ocean_intel.task_workspaces WHERE id=$1',[m.id])).rows[0];
  if(!task||task.status==='failed')throw Error('Task workspace is not resumable; create a new task');
  generations.set(dir,task.generation);
  for(const [field,array] of Object.entries(task.fields)){
   if(array)yield {field,array:true,start:true};
   let after=-1;
   for(;;){
    const rows=(await client.query(`SELECT i.position,i.hash,o.payload FROM ocean_intel.task_inputs i
     JOIN ocean_intel.task_objects o ON o.hash=i.hash
     WHERE i.job_id=$1 AND i.field=$2 AND NOT i.deleted AND i.position>$3 ORDER BY i.position LIMIT 20`,[m.id,field,after])).rows;
    if(!rows.length)break;
    for(const row of rows){if(digest(row.payload)!==row.hash)throw Error('Task article checksum mismatch');yield {field,array,value:JSON.parse(row.payload)};}
    after=rows.at(-1).position;
   }
  }
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();await pool.end();}
}
export async function readTaskWorkspace(file){
 const dir=path.dirname(file);if(!await manifest(dir))return readSnapshot(file);
 const data={};for await(const e of taskEntries(dir)){if(e.start)data[e.field]=[];else if(e.array)data[e.field].push(e.value);else data[e.field]=e.value;}return data;
}
export async function saveTaskWorkspace(file,data){
 const dir=path.dirname(file),m=await manifest(dir);
 if(!m){const tmp=file+'.task.tmp';await writeJsonFile(tmp,data);await fs.rename(tmp,file);return;}
 await connection(async pool=>{
  const c=await pool.connect();try{
   await c.query('BEGIN');
   const task=(await c.query('SELECT generation,status FROM ocean_intel.task_workspaces WHERE id=$1 FOR UPDATE',[m.id])).rows[0];
   if(!task||task.status!=='running'||task.generation!==generations.get(dir))throw Error('Concurrent task update');
   const existing=(await c.query('SELECT field,key,position,hash,deleted FROM ocean_intel.task_inputs WHERE job_id=$1',[m.id])).rows;
   const prior=new Map(existing.map(r=>[JSON.stringify([r.field,r.key]),r])),fields=fieldsOf(data);
   let batch=[],bytes=0;
   const flush=async()=>{
    if(!batch.length)return;
    const encoded=JSON.stringify(batch);
    await c.query(`INSERT INTO ocean_intel.task_objects(hash,payload) SELECT DISTINCT ON(hash) hash,payload
     FROM jsonb_to_recordset($1::jsonb) AS x(hash text,payload text) ON CONFLICT DO NOTHING`,[encoded]);
    await c.query(`INSERT INTO ocean_intel.task_inputs(job_id,field,key,position,hash)
     SELECT $1,field,key,position,hash FROM jsonb_to_recordset($2::jsonb) AS x(field text,key text,position integer,hash text)
     ON CONFLICT(job_id,field,key) DO UPDATE SET hash=EXCLUDED.hash,position=EXCLUDED.position,deleted=false`,[m.id,encoded]);
    batch=[];bytes=0;
   };
   for(const [field,array] of Object.entries(fields)){
    const values=array?data[field]:[data[field]],seen=new Set();
    for(let position=0;position<values.length;position++){
     const value=values[position],key=array?(value?.id!=null?'id:'+value.id:'pos:'+position):'@meta';
     if(seen.has(key))throw Error('Duplicate task article key');seen.add(key);
     const address=JSON.stringify([field,key]),old=prior.get(address);prior.delete(address);
     const payload=JSON.stringify(value),hash=digest(payload);
     if(old?.hash===hash&&old.position===position&&!old.deleted)continue;
     if(batch.length&&(batch.length>=20||bytes+Buffer.byteLength(payload)>2*1024**2))await flush();
     batch.push({field,key,position,hash,payload});bytes+=Buffer.byteLength(payload);
    }
   }
   await flush();
   for(const row of prior.values())if(!row.deleted)await c.query('UPDATE ocean_intel.task_inputs SET deleted=true WHERE job_id=$1 AND field=$2 AND key=$3',[m.id,row.field,row.key]);
   await c.query('UPDATE ocean_intel.task_workspaces SET fields=$2,generation=generation+1 WHERE id=$1',[m.id,fields]);
   await c.query('COMMIT');generations.set(dir,task.generation+1);
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 });
}
export async function finishTaskWorkspace(pool,dir,{committed=false}={}){
 const m=await manifest(dir);if(!m)return;
 const c=await pool.connect();try{
  await c.query('BEGIN');
  if(committed)await c.query('DELETE FROM ocean_intel.task_workspaces WHERE id=$1',[m.id]);
  else{
   // Keep unique changed records for diagnosis; unchanged baseline is already
   // durable in the working library. Never retain another full failed input.
   await c.query('DELETE FROM ocean_intel.task_inputs WHERE job_id=$1 AND hash=base_hash AND NOT deleted',[m.id]);
   await c.query("UPDATE ocean_intel.task_workspaces SET status='failed' WHERE id=$1",[m.id]);
  }
  await c.query(`DELETE FROM ocean_intel.task_objects o WHERE NOT EXISTS(SELECT 1 FROM ocean_intel.task_inputs i WHERE i.hash=o.hash OR i.base_hash=o.hash)
   AND NOT EXISTS(SELECT 1 FROM ocean_intel.workspace_rows w WHERE NOT w.deleted AND w.hash=o.hash)`);
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 if(committed)await fs.rm(marker(dir),{force:true});
 else await fs.writeFile(marker(dir),JSON.stringify({...m,status:'failed',storage:'postgres-article-differences'}));
}
// Only call after acquiring the processing service's exclusive session lock.
// A killed process cannot retain a fresh full baseline on every retry.
export async function recoverTaskWorkspaces(pool,dir=null){
 await pool.query(taskSchemaSql);
 const c=await pool.connect();try{
  await c.query('BEGIN');
  await c.query(`DELETE FROM ocean_intel.task_inputs i USING ocean_intel.task_workspaces t
   WHERE i.job_id=t.id AND t.status='running' AND i.hash=i.base_hash AND NOT i.deleted`);
  const result=await c.query("UPDATE ocean_intel.task_workspaces SET status='failed' WHERE status='running' RETURNING id");
  await c.query(`DELETE FROM ocean_intel.task_objects o WHERE NOT EXISTS(SELECT 1 FROM ocean_intel.task_inputs i WHERE i.hash=o.hash OR i.base_hash=o.hash)
   AND NOT EXISTS(SELECT 1 FROM ocean_intel.workspace_rows w WHERE NOT w.deleted AND w.hash=o.hash)`);
  await c.query('COMMIT');
  if(dir)for(const {id} of result.rows){
   if(path.basename(id)!==id)continue;
   const stage=path.join(dir,'jobs',id),m=await manifest(stage);
   if(m)await fs.writeFile(marker(stage),JSON.stringify({...m,status:'failed',storage:'postgres-article-differences'}));
  }
  return result.rowCount;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
