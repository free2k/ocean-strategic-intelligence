import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {writeJsonFile} from './json-stream.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const version=doc=>hash([doc.id,doc.versionId,doc.extractionRevision||null,doc.industry||null]);
export class ArticleCheckpoints{
 constructor(dir,kind){this.dir=path.join(process.env.INTEL_CHECKPOINT_DIR||path.join(dir,'article-checkpoints'),kind);this.pending=Promise.resolve();}
 save(doc,payload){
  const work=async()=>{await fs.mkdir(this.dir,{recursive:true});const file=path.join(this.dir,hash(doc.id)+'.json'),tmp=file+'.'+randomUUID()+'.tmp';
   try{await writeJsonFile(tmp,{id:doc.id,version:version(doc),payload});await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true});}
  };
  this.pending=this.pending.then(work);return this.pending;
 }
 async restore(documents,apply){
  const docs=new Map(documents.map(doc=>[doc.id,doc]));let files;
  try{files=await fs.readdir(this.dir);}catch(error){if(error.code==='ENOENT')return;throw error;}
  for(const file of files.filter(name=>/^[a-f0-9]{64}\.json$/.test(name))){
   const saved=JSON.parse(await fs.readFile(path.join(this.dir,file),'utf8')),doc=docs.get(saved.id);
   if(doc&&saved.version===version(doc))await apply(doc,saved.payload);
  }
 }
}
export async function acknowledgeCheckpoints(dir,data){
 const base=path.join(dir,'article-checkpoints'),docs=new Map(data.documents.map(doc=>[doc.id,doc])),proofs=new Map((data.evidence||[]).map(row=>[row.id,row]));
 for(const kind of ['extraction','enrichment','evidence']){
  const folder=path.join(base,kind);let files;try{files=await fs.readdir(folder);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  for(const name of files.filter(file=>/^[a-f0-9]{64}\.json$/.test(file))){
   const file=path.join(folder,name),saved=JSON.parse(await fs.readFile(file,'utf8')),doc=docs.get(saved.id);
   const superseded=doc&&saved.version!==version(doc);
   const committed=doc&&(kind==='evidence'?saved.payload.every(row=>proofs.get(row.id)?.quote===row.quote&&proofs.get(row.id)?.quoteZh===row.quoteZh):Object.entries(saved.payload).every(([key,value])=>JSON.stringify(doc[key])===JSON.stringify(value)));
   // Checkpoints are reproducible derived work, not source evidence/history.
   if(superseded||committed||(await fs.stat(file)).mtimeMs<Date.now()-7*86400000)await fs.unlink(file);
  }
 }
}
