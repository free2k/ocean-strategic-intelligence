import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {fail} from './research/ledger.mjs';
const allowed=new Set(['releaseId','snapshotId','topic','sourceId','from','to','countryCodes','relationMode','view']);
export function normalizeDashboardQuery(input={}){
 for(const key of Object.keys(input))if(!allowed.has(key))fail('INVALID_SCOPE','不支持的国别筛选条件');
 const rows=Object.entries(input).filter(([k,v])=>v!==''&&v!==undefined&&!(k==='relationMode'&&v==='external')&&!(k==='view'&&v==='overview'));
 return Object.fromEntries(rows.map(([k,v])=>[k,k==='countryCodes'?String(v).split(',').sort().join(','):v]).sort(([a],[b])=>a.localeCompare(b)));
}
export class DashboardPageCache{
 constructor({data,dir,scope,ttl=30000,clock=Date.now}){Object.assign(this,{data,dir,scope,ttl,clock});this.values=new Map();this.pending=new Map();this.checking=null;this.error=null;}
 async init(){
  if(this.dir)try{const saved=JSON.parse(await fs.readFile(path.join(this.dir,'dashboard-page.json'),'utf8'));if(saved.schema===1&&saved.scope===this.scope&&saved.value?.meta?.releaseId&&Array.isArray(saved.value.data?.events)&&Array.isArray(saved.value.options?.sources))this.values.set('{}',{...saved,at:0});}catch{}
  if(this.values.has('{}'))void this.refresh().catch(()=>{});else await this.refresh().catch(()=>{});
 }
 async save(value){if(!this.dir)return;await fs.mkdir(this.dir,{recursive:true});const file=path.join(this.dir,'dashboard-page.json'),tmp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(tmp,JSON.stringify(value),{mode:0o600});await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true});}}
 async refresh(){
  if(this.checking)return this.checking;
  const task=(async()=>{const release=await this.data.ledger.resolveRelease({}),old=this.values.get('{}');let value;if(old?.value?.meta?.releaseId===release.releaseId)value={...old,at:this.clock()};else{const page=await this.data.page({releaseId:release.releaseId});value={schema:1,scope:this.scope,value:page,at:this.clock(),version:createHash('sha256').update(JSON.stringify(page)).digest('hex')};}await this.save(value);this.values.set('{}',value);this.error=null;return value;})().catch(e=>{this.error='国别资料更新暂未完成，当前显示上次成功读取的发布版本。';throw e;});
  this.checking=task;try{return await task;}finally{if(this.checking===task)this.checking=null;}
 }
 async get(input={},force=false){
  let query=normalizeDashboardQuery(input);const defaultView=!Object.keys(query).length,followLatest=!query.releaseId&&!query.snapshotId;
  if(!defaultView&&followLatest){if(!this.values.has('{}')||force)await this.refresh();else if(this.clock()-this.values.get('{}').at>=this.ttl)void this.refresh().catch(()=>{});query=normalizeDashboardQuery({...query,releaseId:this.values.get('{}').value.meta.releaseId});}
  const key=JSON.stringify(query);
  if(key==='{}'){
   if(force||!this.values.has(key))await this.refresh();else if(this.clock()-this.values.get(key).at>=this.ttl)void this.refresh().catch(()=>{});
  }else if(!this.values.has(key)){
   if(!this.pending.has(key))this.pending.set(key,this.data.page(query).then(value=>{const cached={value,at:this.clock(),version:createHash('sha256').update(JSON.stringify(value)).digest('hex')};if(this.values.size>=32){const oldest=[...this.values.keys()].find(k=>k!=='{}');if(oldest)this.values.delete(oldest);}this.values.set(key,cached);return cached;}).finally(()=>this.pending.delete(key)));
   await this.pending.get(key);
  }
  const saved=this.values.get(key);if(!saved)fail('RESEARCH_NOT_INITIALIZED','国别资料尚未就绪，请稍后重试',503);
  return {...saved.value,dashboardView:{version:saved.version,refreshing:followLatest&&!!this.checking,error:followLatest?this.error:null}};
 }
}
