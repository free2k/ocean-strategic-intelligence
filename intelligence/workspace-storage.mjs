import {createHash,randomUUID} from 'node:crypto';

// Keep PostgreSQL's JSONB containers small, including large nested arrays in
// attachments. Text parts preserve exact JSON and never split a surrogate pair.
export const workspaceSchemaSql=`CREATE TABLE IF NOT EXISTS ocean_intel.workspace_parts (
 generation text NOT NULL, field text NOT NULL, part integer NOT NULL,
 payload text NOT NULL, PRIMARY KEY(generation,field,part))`;
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
export async function readWorkspaceClient(client){
 const root=(await client.query("SELECT payload FROM ocean_intel.runs WHERE id='current'")).rows[0]?.payload;
 return hydrateWorkspace(root,async(generation,field)=>(await client.query(
  'SELECT part,payload FROM ocean_intel.workspace_parts WHERE generation=$1 AND field=$2 ORDER BY part',[generation,field])).rows);
}
export async function readWorkspace(pool){
 const client=await pool.connect();
 try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const data=await readWorkspaceClient(client);await client.query('COMMIT');return data;}
 catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
// Caller owns the transaction and the insight-data advisory lock.
export async function writeWorkspace(client,data){
 const {root,parts}=splitWorkspace(data),generation=root._workspaceParts?.generation;
 for(const part of parts)await client.query('INSERT INTO ocean_intel.workspace_parts(generation,field,part,payload) VALUES($1,$2,$3,$4)',[generation,part.field,part.part,part.payload]);
 await client.query("INSERT INTO ocean_intel.runs(id,payload) VALUES('current',$1) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()",[root]);
 await client.query('DELETE FROM ocean_intel.workspace_parts WHERE generation IS DISTINCT FROM $1',[generation||null]);
}
