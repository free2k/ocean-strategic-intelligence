import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {writeJsonFile} from './json-stream.mjs';

export function changedRowsBackup(live,incoming,{updatedFields=null}={}){
 const before={},inserted={};
 for(const field of ['sources','documents','entities','events','relations','observations','evidence','series']){
  const ids=new Set((incoming[field]||[]).map(row=>row.id)),existing=new Set((live[field]||[]).map(row=>row.id));
  before[field]=!updatedFields||updatedFields.includes(field)?(live[field]||[]).filter(row=>ids.has(row.id)):[];inserted[field]=[...ids].filter(id=>!existing.has(id));
 }
 return {format:'changed-rows-v1',workspaceRevision:live._workspaceDelta?.revision||null,generatedAt:live.generatedAt,before,inserted,errors:live.errors||[]};
}
export async function saveChangeBackup(dir,kind,data){
 if(!['series','news'].includes(kind))throw Error('Unknown change backup kind');
 await fs.mkdir(dir,{recursive:true});const prefix='delta-'+kind+'-',name=prefix+new Date().toISOString().replaceAll(':','-')+'-'+randomUUID()+'.json';
 const file=path.join(dir,name),tmp=file+'.tmp';
 try{await writeJsonFile(tmp,data);await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true});}
 // Only rotate this format; never delete legacy full historical backups here.
 const files=(await fs.readdir(dir)).filter(name=>name.startsWith(prefix)&&name.endsWith('.json')).sort().reverse();
 for(const old of files.slice(3))await fs.unlink(path.join(dir,old));
}
