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
 constructor(pool){this.pool=pool;this.records=new Map();this.recordBytes=0;this.pendingReads=new Map();}
 async head(){return (await this.pool.query("SELECT payload FROM ocean_research.head WHERE id='latest'")).rows[0]?.payload||null;}
 async read(id){
  check(id);let encoded=this.records.get(id);
  if(encoded===undefined){
   if(!this.pendingReads.has(id))this.pendingReads.set(id,(async()=>{
    const value=(await this.pool.query('SELECT payload::text AS payload FROM ocean_research.records WHERE id=$1',[id])).rows[0]?.payload;
    if(!value)return null;const text=typeof value==='string'?value:JSON.stringify(value),bytes=Buffer.byteLength(text);
    if(bytes<=64*1024*1024){while(this.records.size&&(this.recordBytes+bytes>64*1024*1024||this.records.size>=32)){const oldest=this.records.keys().next().value;this.recordBytes-=Buffer.byteLength(this.records.get(oldest));this.records.delete(oldest);}this.records.set(id,text);this.recordBytes+=bytes;}
    return text;
   })().finally(()=>this.pendingReads.delete(id)));
   encoded=await this.pendingReads.get(id);
  }
  // Immutable records are cached; callers receive an independent mutable copy.
  return encoded?JSON.parse(encoded):null;
 }
 async readProjection(id,view,sql,params=[]){
  check(id);const key=view+':'+id+':'+JSON.stringify(params);this.projections||=new Map();this.projectionPending||=new Map();
  if(this.projections.has(key))return JSON.parse(this.projections.get(key));
  if(!this.projectionPending.has(key))this.projectionPending.set(key,(async()=>{const value=(await this.pool.query(sql,[id,...params])).rows[0]?.payload;if(!value)return null;const text=typeof value==='string'?value:JSON.stringify(value);if(Buffer.byteLength(text)<16*1024*1024){while(this.projections.size>=2)this.projections.delete(this.projections.keys().next().value);this.projections.set(key,text);}return text;})().finally(()=>this.projectionPending.delete(key)));
  const text=await this.projectionPending.get(key);return text?JSON.parse(text):null;
 }
 async readObjectIndex(id,snapshotId){return this.readProjection(id,'object-index',`SELECT jsonb_build_object('kind',payload->'kind','objects',
 (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o->'id','name',o->'name','type',o->'type','aliases',o->'aliases','identityWarning',o->'identityWarning','mergedInto',o->'mergedInto','firstSeenAt',o->'firstSeenAt','eventIds',o->'eventIds','documentRefs',
 (SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('documentId',d->'documentId','snapshotId',d->'snapshotId','publishedAt',d->'publishedAt','topic',d->'topic','sourceId',d->'sourceId')),'[]'::jsonb) FROM jsonb_array_elements(o->'documentRefs') d WHERE d->>'snapshotId'=$2))), '[]'::jsonb) FROM jsonb_array_elements(payload->'objects') o),
 'events',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e->'id','versions',(SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('documentId',v->'documentId','occurredAt',v->'occurredAt','publishedAt',v->'publishedAt','dateQuote',v->'dateQuote','scheduledAt',v->'scheduledAt')),'[]'::jsonb) FROM jsonb_array_elements(e->'versions') v))),'[]'::jsonb) FROM jsonb_array_elements(payload->'events') e))::text payload FROM ocean_research.records WHERE id=$1`,[snapshotId]);}
 // Keep complete member histories; other objects only supply relation endpoint names.
 async readObjectDetail(id,objectId){return this.readProjection(id,'object-detail',`WITH record AS MATERIALIZED (SELECT payload FROM ocean_research.records WHERE id=$1),
 members AS MATERIALIZED (SELECT o FROM record,jsonb_array_elements(payload->'objects') o WHERE o->>'id'=$2 OR o->>'mergedInto'=$2),
 ids AS (SELECT ARRAY(SELECT DISTINCT jsonb_array_elements_text(o->'eventIds') FROM members) events,ARRAY(SELECT DISTINCT jsonb_array_elements_text(o->'relationIds') FROM members) relations,ARRAY(SELECT DISTINCT jsonb_array_elements_text(o->'factIds') FROM members) facts)
 SELECT jsonb_build_object('kind',payload->'kind',
 'objects',(SELECT coalesce(jsonb_agg(CASE WHEN o->>'id'=$2 OR o->>'mergedInto'=$2 THEN o ELSE jsonb_build_object('id',o->'id','name',o->'name','documentRefs','[]'::jsonb) END),'[]'::jsonb) FROM jsonb_array_elements(payload->'objects') o),
 'events',(SELECT coalesce(jsonb_agg(e),'[]'::jsonb) FROM jsonb_array_elements(payload->'events') e WHERE e->>'id'=ANY(ids.events)),
 'relations',(SELECT coalesce(jsonb_agg(e),'[]'::jsonb) FROM jsonb_array_elements(payload->'relations') e WHERE e->>'id'=ANY(ids.relations)),
 'facts',(SELECT coalesce(jsonb_agg(e),'[]'::jsonb) FROM jsonb_array_elements(payload->'facts') e WHERE e->>'id'=ANY(ids.facts)),
 'operations',(SELECT coalesce(jsonb_agg(e),'[]'::jsonb) FROM jsonb_array_elements(payload->'operations') e WHERE e->>'sourceId'=$2 OR e->>'targetId'=$2))::text payload FROM record,ids`,[objectId]);}
 // Filter by document before taking the last two versions, preserving summary comparison semantics.
 async readMonitorIndex(id,snapshotId,documentIds){return this.readProjection(id,'monitor-index',`WITH record AS MATERIALIZED (SELECT payload FROM ocean_research.records WHERE id=$1)
 SELECT jsonb_build_object('kind',payload->'kind',
 'objects',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o->'id','mergedInto',o->'mergedInto','documentRefs',(SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('snapshotId',d->'snapshotId','documentId',d->'documentId')),'[]'::jsonb) FROM jsonb_array_elements(o->'documentRefs') d WHERE d->>'snapshotId'=$2 AND d->>'documentId'=ANY($3::text[])))),'[]'::jsonb) FROM jsonb_array_elements(payload->'objects') o),
 'events',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e->'id','versions',v.versions)),'[]'::jsonb) FROM jsonb_array_elements(payload->'events') e CROSS JOIN LATERAL (SELECT jsonb_agg(item ORDER BY n) versions,count(*) count FROM (SELECT item,n FROM jsonb_array_elements(e->'versions') WITH ORDINALITY AS x(item,n) WHERE item->>'documentId'=ANY($3::text[]) ORDER BY n DESC LIMIT 2) last_versions) v WHERE v.count=2))::text payload FROM record`,[snapshotId,[...documentIds].sort()]);}
 async readSnapshotIndex(id){return this.readProjection(id,'snapshot-index',`SELECT jsonb_build_object('kind',payload->'kind','entries',(SELECT jsonb_agg(jsonb_build_object('documentId',e->'documentId','classification',e->'classification','body',jsonb_build_object('sourceId',e->'body'->'sourceId','publishedAt',e->'body'->'publishedAt'))) FROM jsonb_array_elements(payload->'entries') e))::text payload FROM ocean_research.records WHERE id=$1`);}
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
   for(const [id,record] of Object.entries(records)){check(id);const old=(await c.query('SELECT payload::text AS payload FROM ocean_research.records WHERE id=$1',[id])).rows[0]?.payload;if(old){if(digest(old)!==digest(record))fail('IMMUTABLE_CONFLICT','Existing immutable record differs',409);}else await c.query('INSERT INTO ocean_research.records(id,kind,payload) VALUES($1,$2,$3)',[id,record.kind,record]);}
   await c.query("INSERT INTO ocean_research.head(id,payload) VALUES('latest',$1) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload",[head]);await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
}
