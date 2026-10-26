import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {invalid} from './contracts.mjs';

export const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,canonical(v[k])])):v;
export const digest=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const validId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
const validRecord=r=>r&&validId(r.id)&&typeof r.title==='string'&&typeof r.createdAt==='string'&&r.method?.id&&r.input&&r.calculation?.result;
export function summary(r){return {id:r.id,versionId:r.versionId||r.id,studyId:r.studyId||null,parentId:r.parentVersionId||r.parentId||null,parentVersionId:r.parentVersionId||r.parentId||null,title:r.title,method:r.method,status:r.status,createdAt:r.createdAt,dataset:r.dataset,scope:r.scope,dataHash:r.dataHash,numericInputHash:r.numericInputHash,evidenceHash:r.evidenceHash,configHash:r.configHash,parameterVersion:r.parameterVersion,engineVersion:r.engineVersion,templateId:r.templateId||null,requestId:r.requestId,requestHash:r.requestHash,calculation:{method:r.method.id,notes:r.calculation.notes||[]}};}
const queues=new Map();
export class StrategyRepository {
  constructor(dir,{readOnly=false}={}){this.dir=path.join(dir,'strategy-research');this.warnings=[];this.readOnly=readOnly;}
  transact(fn){const previous=queues.get(this.dir)||Promise.resolve(),next=previous.then(fn);queues.set(this.dir,next.catch(()=>{}));return next;}
  async index(){
    if(!this.readOnly)await fs.mkdir(this.dir,{recursive:true,mode:0o700});
    let index={version:1,items:[],warnings:[]};
    try {const saved=JSON.parse(await fs.readFile(path.join(this.dir,'_index.json'),'utf8'));if(!Array.isArray(saved?.items)||saved.version!==1||saved.items.some(r=>!r||!validId(r.id)||typeof r.createdAt!=='string'||!r.method?.id)||saved.warnings!==undefined&&!Array.isArray(saved.warnings))throw Error('invalid index');index={...saved,warnings:saved.warnings||[]};}catch(e){if(e.code!=='ENOENT')index.warnings.push({code:'INDEX_REBUILT',message:'摘要索引损坏，已从不可变版本恢复'});}
    const files=(await fs.readdir(this.dir).catch(e=>{if(this.readOnly&&e.code==='ENOENT')return [];throw e;})).filter(f=>validId(f.slice(0,-5))&&f.endsWith('.json'));
    let changed=false;
    const present=new Set(files);
    for(const item of [...index.items])if(!present.has(item.id+'.json')){index.items=index.items.filter(r=>r.id!==item.id);index.warnings.push({code:'RECORD_MISSING',file:item.id+'.json',message:'索引引用的版本文件缺失，需管理员恢复'});changed=true;}
    for(const f of files){
      const id=f.slice(0,-5),old=index.items.find(r=>r.id===id),warning=index.warnings.find(w=>w.file===f),stat=await fs.stat(path.join(this.dir,f)),stamp={size:stat.size,mtime:stat.mtimeMs};
      if((old||warning)?._storage?.size===stamp.size&&(old||warning)?._storage?.mtime===stamp.mtime)continue;
      index.items=index.items.filter(r=>r.id!==id);index.warnings=index.warnings.filter(w=>w.file!==f);
      try{const r=JSON.parse(await fs.readFile(path.join(this.dir,f),'utf8'));if(!validRecord(r)||r.id!==id)throw Error('invalid record');index.items.push({...summary(r),_storage:stamp});}
      catch {index.warnings.push({code:'RECORD_QUARANTINED',file:f,_storage:stamp,message:'坏记录已从列表隔离，原文件保留供管理员恢复'});console.error('strategy record isolated',f);}
      changed=true;
    }
    // Legacy versions inherit only through an explicit parent link, never title similarity.
    const byId=new Map(index.items.map(r=>[r.id,r]));
    const study=(r,visited=new Set())=>{if(r.studyId)return r.studyId;if(visited.has(r.id))return r.id;visited.add(r.id);const p=byId.get(r.parentId);return p?study(p,visited):r.id;};
    for(const r of index.items){if(!r.studyId){r.studyId=study(r);changed=true;}if(r.parentId&&!byId.has(r.parentId))r.lineageWarning='父版本缺失，主题归属待核对';}
    index.items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
    if(changed&&!this.readOnly)await this.writeIndex(index).catch(()=>index.warnings.push({code:'INDEX_WRITE_FAILED',message:'版本文件已保留；摘要索引写入失败，可重试刷新'}));
    this.warnings=index.warnings;return index;
  }
  async writeIndex(index){if(this.readOnly)invalid('只读研究目录不能写入',[],405);const tmp=path.join(this.dir,'_index.'+randomUUID()+'.tmp');try{await fs.writeFile(tmp,JSON.stringify(index),{mode:0o600,flag:'wx'});await fs.rename(tmp,path.join(this.dir,'_index.json'));}finally{await fs.rm(tmp,{force:true});}}
  async page({page=1,pageSize=20,studyId}={}){
    if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)invalid('分页参数无效');
    const index=await this.index(),items=index.items.filter(r=>!studyId||r.studyId===studyId);
    return {items:items.slice((page-1)*pageSize,page*pageSize).map(({_storage,...r})=>r),page,pageSize,total:items.length,totalStudies:new Set(index.items.map(r=>r.studyId)).size,warnings:index.warnings.map(({_storage,...w})=>w)};
  }
  async list(){const {items}=await this.index();return Promise.all(items.map(r=>this.get(r.id)));}
  async get(id){
    if(!validId(id))invalid('研究版本编号无效');
    let r;try{r=JSON.parse(await fs.readFile(path.join(this.dir,id+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')invalid('研究版本不存在',[],404,'NOT_FOUND');invalid('该研究记录损坏，原文件已保留供恢复',[],503,'RECORD_UNAVAILABLE');}
    if(!validRecord(r))invalid('研究记录格式损坏',[],503,'RECORD_UNAVAILABLE');
    return r;
  }
  async findRequest(requestId,requestHash){
    if(!requestId)return null;
    const index=await this.index(),old=index.items.find(r=>r.requestId===requestId);
    if(!old)return null;
    if(old.requestHash!==requestHash)invalid('同一请求标识已用于不同内容，请使用新的请求标识',[],409,'IDEMPOTENCY_CONFLICT');
    return this.get(old.id);
  }
  async save(record){
    if(this.readOnly)invalid('只读研究目录不能保存',[],405);
    if(!validRecord(record))invalid('不能保存不完整的研究记录');
    await fs.mkdir(this.dir,{recursive:true,mode:0o700});
    const dest=path.join(this.dir,record.id+'.json'),tmp=dest+'.'+randomUUID()+'.tmp';
    try{
      const handle=await fs.open(tmp,'wx',0o600);try{await handle.writeFile(JSON.stringify(record,null,2));await handle.sync();}finally{await handle.close();}
      await fs.link(tmp,dest); // Exclusive commit: never replace an existing version.
    }finally{await fs.rm(tmp,{force:true});}
    // A failed derived index does not undo a committed, durable version.
    await this.index().catch(()=>console.error('strategy index refresh failed',record.id));
    return record;
  }
}
