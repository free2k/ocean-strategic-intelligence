import {createHash,randomUUID} from 'node:crypto';
import {jsonTextChunks} from './json-stream.mjs';
import {snapshotEntries} from './snapshot-reader.mjs';
import {deltaSchemaSql,writeDeltas,readDeltas} from './workspace-deltas.mjs';

// Keep PostgreSQL's JSONB containers small, including large nested arrays in
// attachments. Text parts preserve exact JSON and never split a surrogate pair.
export const workspaceSchemaSql=`CREATE TABLE IF NOT EXISTS ocean_intel.workspace_parts (
 generation text NOT NULL, field text NOT NULL, part integer NOT NULL,
 payload text NOT NULL, PRIMARY KEY(generation,field,part));`+deltaSchemaSql;
const digest=value=>createHash('sha256').update(value).digest('hex');
export function splitWorkspace(data,{threshold=4*1024*1024,partChars=1024*1024}={}){
 if(!Number.isInteger(partChars)||partChars<2)throw Error('partChars must be at least two');
 const root={...data},parts=[],fields={};
 delete root._workspaceParts;
 for(const [field,value] of Object.entries(root)){
  const text=JSON.stringify(value);if(text===undefined||Buffer.byteLength(text)<threshold)continue;
  let part=0;
  for(let start=0;start<text.length;){
   let end=Math.min(start+partChars,text.length);
   if(end<text.length&&text.charCodeAt(end-1)>=0xD800&&text.charCodeAt(end-1)<=0xDBFF)end--;
   parts.push({field,part:part++,payload:text.slice(start,end)});start=end;
  }
  fields[field]={parts:part,sha256:digest(text)};
  delete root[field];
 }
 if(parts.length)root._workspaceParts={version:1,generation:randomUUID(),fields};
 return {root,parts};
}
export async function hydrateWorkspace(root,readParts){
 if(!root?._workspaceParts)return root;
 const manifest=root._workspaceParts;
 if(manifest.version!==1)throw Error('Unsupported workspace storage version');
 const data={...root};delete data._workspaceParts;
 for(const [field,expected] of Object.entries(manifest.fields)){
  const parts=await readParts(manifest.generation,field);
  if(parts.length!==expected.parts||parts.some((p,i)=>p.part!==i))
   throw Object.assign(Error('Workspace parts missing or out of order'),{code:'WORKSPACE_PARTS_MISSING'});
  const text=parts.map(p=>p.payload).join('');
  if(digest(text)!==expected.sha256)throw Object.assign(Error('Workspace part checksum mismatch'),{code:'WORKSPACE_PARTS_CORRUPT'});
  data[field]=JSON.parse(text);
 }
 return data;
}
// Call with a client already inside a transaction. Readers retain an MVCC
// snapshot while a concurrent writer replaces the generation.
export async function readWorkspaceClient(client,previous=null){
 const record=(await client.query("SELECT payload,updated_at::text AS version FROM ocean_intel.runs WHERE id='current'")).rows[0],root=record?.payload;
 if(!root)return root;
 if(previous?._readVersion===record.version)return previous;
 const data=root._workspaceDelta?await readDeltas(client,root,previous):{...root};
 const manifest=root._workspaceParts;delete data._workspaceParts;
 const hashes={};
 for(const [field,expected] of Object.entries(manifest?.fields||{})){
  hashes[field]=expected.sha256;
  if(root._workspaceDelta?.fields.includes(field))continue;
  if(previous?._partHashes?.[field]===expected.sha256){data[field]=previous[field];continue;}
  const hash=createHash('sha256');
  async function* source(){
   yield '{'+JSON.stringify(field)+':';
   for(let part=0;part<expected.parts;part++){
    const row=(await client.query('SELECT payload FROM ocean_intel.workspace_parts WHERE generation=$1 AND field=$2 AND part=$3',[manifest.generation,field,part])).rows[0];
    if(!row)throw Object.assign(Error('Workspace part missing'),{code:'WORKSPACE_PARTS_MISSING'});
    hash.update(row.payload);yield row.payload;
   }
   yield '}';
  }
  for await(const entry of snapshotEntries(source())){if(entry.start)data[field]=[];else if(entry.array)data[field].push(entry.value);else data[field]=entry.value;}
  if(hash.digest('hex')!==expected.sha256)throw Object.assign(Error('Workspace part checksum mismatch'),{code:'WORKSPACE_PARTS_CORRUPT'});
 }
 Object.defineProperty(data,'_partHashes',{value:hashes,enumerable:false});
 Object.defineProperty(data,'_readVersion',{value:record.version,enumerable:false});
 return data;
}
export async function readWorkspace(pool,previous=null){
 const client=await pool.connect();
 try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const data=await readWorkspaceClient(client,previous);await client.query('COMMIT');return data;}
 catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
// Caller owns the transaction and the insight-data advisory lock.
export async function writeWorkspace(client,data,previous=null){
 const root={...data},fields={},generation=randomUUID();delete root._workspaceParts;
 root._workspaceDelta=await writeDeltas(client,data,previous);
 // Article and fact arrays now live as independently addressable DB rows.
 // Only non-array legacy metadata needs chunked workspace parts.
 for(const field of root._workspaceDelta.fields)delete root[field];
 for(const [field,value] of Object.entries(root)){
  if(value===undefined)continue;
  const hash=createHash('sha256');let pending=[],bytes=0,part=0,large=false;
  const save=async payload=>client.query('INSERT INTO ocean_intel.workspace_parts(generation,field,part,payload) VALUES($1,$2,$3,$4)',[generation,field,part++,payload]);
  for(const text of jsonTextChunks(value,1024*1024)){
   hash.update(text);bytes+=Buffer.byteLength(text);
   if(large)await save(text);
   else{pending.push(text);if(bytes>=4*1024*1024){large=true;for(const chunk of pending)await save(chunk);pending=[];}}
  }
  if(large){fields[field]={parts:part,sha256:hash.digest('hex')};delete root[field];}
 }
 if(Object.keys(fields).length)root._workspaceParts={version:1,generation,fields};
 await client.query("INSERT INTO ocean_intel.runs(id,payload) VALUES('current',$1) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()",[root]);
 await client.query('DELETE FROM ocean_intel.workspace_parts WHERE generation IS DISTINCT FROM $1',[root._workspaceParts?generation:null]);
 return root._workspaceDelta;
}
