export const workspaceRowHash=Symbol('workspace-row-hash');
import {createHash} from 'node:crypto';

export const deltaSchemaSql=`CREATE SEQUENCE IF NOT EXISTS ocean_intel.workspace_revision;
CREATE TABLE IF NOT EXISTS ocean_intel.workspace_rows (
 field text NOT NULL, key text NOT NULL, position integer NOT NULL,
 payload text, hash text, revision bigint NOT NULL, deleted boolean NOT NULL DEFAULT false,
 PRIMARY KEY(field,key));
CREATE INDEX IF NOT EXISTS workspace_rows_revision ON ocean_intel.workspace_rows(revision,field,key);`;

// Called under the workspace write lock and in the same transaction as its head.
// Unchanged articles are neither copied to a change log nor rewritten in the DB.
export async function writeDeltas(client,data,previous=null){
 const revision=(await client.query("SELECT nextval('ocean_intel.workspace_revision')::text AS revision")).rows[0].revision;
 const fields=[];
 for(const [field,values] of Object.entries(data)){
  if(!Array.isArray(values))continue;fields.push(field);
  const keys=[],seen=new Set(),prior=new Map(previous?._workspaceDelta?(previous[field]||[]).map((value,position)=>[value?.id!=null?'id:'+value.id:'pos:'+position,{value,position}]):[]);let batch=[],bytes=0;
  const flush=async()=>{
   if(!batch.length)return;
   await client.query(`INSERT INTO ocean_intel.workspace_rows(field,key,position,payload,hash,revision,deleted)
    SELECT $1,x.key,x.position,x.payload,x.hash,$2::bigint,false
    FROM jsonb_to_recordset($3::jsonb) AS x(key text,position integer,payload text,hash text)
    ON CONFLICT(field,key) DO UPDATE SET position=EXCLUDED.position,payload=EXCLUDED.payload,
    hash=EXCLUDED.hash,revision=EXCLUDED.revision,deleted=false
    WHERE workspace_rows.hash IS DISTINCT FROM EXCLUDED.hash OR workspace_rows.position<>EXCLUDED.position OR workspace_rows.deleted`,[field,revision,JSON.stringify(batch)]);
   batch=[];bytes=0;
  };
  for(let position=0;position<values.length;position++){
   const value=values[position],key=value?.id!=null?'id:'+value.id:'pos:'+position;
   if(seen.has(key))throw Error('Duplicate workspace row: '+field+'/'+key);seen.add(key);keys.push(key);
   const before=prior.get(key);
   if(before?.position===position&&before.value===value)continue;
   const payload=JSON.stringify(value);
   if(before?.position===position&&JSON.stringify(before.value)===payload)continue;
   const hash=createHash('sha256').update(payload).digest('hex');
   if(batch.length&&(batch.length>=20||bytes+Buffer.byteLength(payload)>2*1024*1024))await flush();
   batch.push({key,position,payload,hash});bytes+=Buffer.byteLength(payload);
  }
  await flush();
  await client.query(`UPDATE ocean_intel.workspace_rows SET deleted=true,payload=null,hash=null,revision=$3
   WHERE field=$1 AND NOT(key=ANY($2::text[])) AND NOT deleted`,[field,keys,revision]);
 }
 await client.query(`UPDATE ocean_intel.workspace_rows SET deleted=true,payload=null,hash=null,revision=$2
  WHERE NOT(field=ANY($1::text[])) AND NOT deleted`,[fields,revision]);
 return {revision,fields};
}

export async function readDeltas(client,head,previous){
 const manifest=head._workspaceDelta,from=previous?._workspaceDelta?.revision||'0';
 if(!manifest)throw Error('Workspace delta index unavailable');
 const data={...head};
 const maps=new Map(manifest.fields.map(field=>[field,new Map((previous?.[field]||[]).map((value,position)=>[value?.id!=null?'id:'+value.id:'pos:'+position,{value,position}]))]));
 let cursor=[from,'',''];
 for(;;){
  const rows=(await client.query(`SELECT field,key,position,payload,hash,deleted,revision::text FROM ocean_intel.workspace_rows
   WHERE revision>$1::bigint AND revision<=$2::bigint AND (revision,field,key)>($3::bigint,$4,$5)
   ORDER BY revision,field,key LIMIT 20`,[from,manifest.revision,...cursor])).rows;
  if(!rows.length)break;
  for(const row of rows){const map=maps.get(row.field);if(map){if(row.deleted)map.delete(row.key);else{const value=JSON.parse(row.payload);if(value&&typeof value==='object'&&row.hash)Object.defineProperty(value,workspaceRowHash,{value:row.hash});map.set(row.key,{value,position:row.position});}}}
  const last=rows.at(-1);cursor=[last.revision,last.field,last.key];
 }
 for(const [field,map] of maps)data[field]=[...map.values()].sort((a,b)=>a.position-b.position).map(r=>r.value);
 for(const field of previous?._workspaceDelta?.fields||[])if(!manifest.fields.includes(field))delete data[field];
 return data;
}
