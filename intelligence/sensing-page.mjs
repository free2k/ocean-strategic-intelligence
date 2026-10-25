import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {unifiedIEA} from './iea-quant.mjs';
import {processingSummary} from './auto-extract.mjs';
import {auditBridge} from './classification-audit.mjs';

const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));
const jobFields=['id','action','target','status','error','created_at','started_at','finished_at'];
const resultFields=['accounts','inserted','updated','duplicate','failed','streams'];
const accountKey=value=>String(value||'').normalize('NFKC').replace(/\s/g,'').toLowerCase();

// Keep the existing subscription-history identity rules without loading article
// bodies, image diagnostics or provider responses into the source navigation.
export function attachSourceHistory(list,rows){
 for(const item of list)item.historyCount=0;
 for(const row of rows){
  const decoded=Buffer.from(String(row.fakeid||''),'base64').toString('utf8'),identity=/^\d+$/.test(decoded)?decoded:null;
  const matches=list.filter(s=>s.source_id===row.id||row.type==='wechat'&&s.platform==='mp'&&(identity?String(s.remoteId)===identity:accountKey(s.name)===accountKey(row.name)));
  if(matches.length===1)matches[0].historyCount+=Number(row.count);
 }
 return list;
}

export function sourceRssChannels(local,external,health={}){
 const byUrl=new Map();
 for(const source of local){
  let url;try{url=new URL(source.alias);if(url.hostname==='cn.todayrss.com')continue;}catch{continue;}
  const managed=source.fakeid?.startsWith('oilprice-'),previous=byUrl.get(url.href);
  const row={...source,method:'rss',manager:managed?'oilprice':'rss',status:health[url.href]?.status||'unverified',checkedAt:health[url.href]?.checkedAt,error:health[url.href]?.error};delete row.fakeid;
  if(!previous)byUrl.set(url.href,row);else if(managed)byUrl.set(url.href,{...row,count:row.count+previous.count});else previous.count+=row.count;
 }
 for(const {id,payload:p,count}of external){
  let url;try{url=new URL(p.url);if(url.hostname==='cn.todayrss.com')continue;}catch{continue;}
  const previous=byUrl.get(url.href);
  byUrl.set(url.href,{id:'intel:'+id,name:p.name,alias:p.url,sitemap:p.sitemap,sitemapStatus:p.sitemap?health[p.sitemap]?.status:undefined,sitemapCheckedAt:p.sitemap?health[p.sitemap]?.checkedAt:undefined,method:p.method,manager:'intelligence',isOverseas:p.country!=='CN',count,localCount:previous?.count||0,status:p.status||'unverified',checkedAt:p.checkedAt,error:p.error,scope:p.scope});
 }
 return [...byUrl.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
}

async function sourceRecords(pool,shared){
 if(!pool)return {subscriptions:[],jobs:[],history:[],rss:[]};
 const db=await pool.connect();
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const subscriptions=(await db.query(`SELECT id,source_id,enabled,present,posts,articles,last_sync,status,
   jsonb_build_object('name',payload->>'name','platform',payload->>'platform','handle',payload->>'handle','remoteId',payload->>'remoteId') payload
   FROM mp2rss.subscriptions ORDER BY id`)).rows;
  const jobs=shared?[]:(await db.query(`SELECT id,action,target,status,error,created_at,started_at,finished_at,
   jsonb_build_object('accounts',result->'accounts','inserted',result->'inserted','updated',result->'updated','duplicate',result->'duplicate','failed',result->'failed','streams',result->'streams') result
   FROM mp2rss.jobs ORDER BY id DESC LIMIT 12`)).rows;
  let history=[],rss=[];
  if(!shared){
   history=(await db.query(`WITH collected AS MATERIALIZED (SELECT i.article_id,coalesce(a.link,i.payload->>'url') AS url FROM mp2rss.items i LEFT JOIN public.articles a ON a.id=i.article_id)
    SELECT s.id,s.name,s.fakeid,s.type,count(*)::int AS count FROM public.articles a JOIN public.sources s ON s.id=a.source_id
    WHERE s.type NOT IN ('mp2rss_mp','mp2rss_x') AND NOT EXISTS(SELECT 1 FROM collected i WHERE i.article_id=a.id)
    AND NOT EXISTS(SELECT 1 FROM collected i WHERE i.url=a.link) GROUP BY s.id,s.name,s.fakeid,s.type`)).rows;
   const local=(await db.query(`SELECT s.id,s.name,s.alias,s.fakeid,s.is_overseas AS "isOverseas",count(a.id)::int AS count
    FROM public.sources s LEFT JOIN public.articles a ON a.source_id=s.id WHERE s.type='rss' GROUP BY s.id ORDER BY s.id`)).rows;
   const health=(await db.query("SELECT payload FROM mp2rss.state WHERE id='external-feed-health'")).rows[0]?.payload||{};
   const external=(await db.query(`SELECT s.id,s.payload,count(d.id)::int AS count FROM ocean_intel.sources s
    LEFT JOIN ocean_intel.documents d ON d.payload->>'sourceId'=s.id
    WHERE s.payload->>'checkedAt' IS NOT NULL AND s.payload->>'method' NOT IN ('api','mp2rss') GROUP BY s.id,s.payload`)).rows;
   rss=sourceRssChannels(local,external,health);
  }
  await db.query('COMMIT');return {subscriptions,jobs,history,rss};
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

export function sensingPagePayload({data,audit,records,collection,shared=false,observedAt=new Date().toISOString()}){
 const counts=new Map((audit.subscriptions||[]).map(s=>[s.id,s]));
 const subscriptions=(records.subscriptions.length?records.subscriptions:audit.subscriptions||[]).filter(s=>s.present!==false).map(s=>{
  const p=s.payload||{},stats=counts.get(s.id)||{};
  return {id:s.id,source_id:s.source_id,platform:p.platform||((s.id||'').startsWith('x:')?'x':'mp'),name:p.name||s.name||s.id,handle:p.handle||'',remoteId:p.remoteId,enabled:s.enabled,posts:s.posts,articles:s.articles,status:s.status,count:Number(stats.count??s.count??0),ready:Number(stats.ready??s.ready??0),latest:stats.latest||s.latest||null,lastSync:s.last_sync||s.lastSync||null};
 });
 attachSourceHistory(subscriptions,records.history);
 const raw=unifiedIEA(data),sources=raw.sources.map(s=>pick(s,['id','name','url','method','country','status','checkedAt','scope','articleCount','bodyDocuments','records','observations','metricLabel']));
 const rss=shared?{list:data.sources.filter(s=>s.method==='rss').map(s=>({...s,id:'intel:'+s.id,alias:s.url,count:data.documents.filter(d=>d.sourceId===s.id).length})),sharedRegistry:true,readOnly:true}:{list:records.rss};
 return {observedAt:audit.observedAt,catalogAt:observedAt,classification:audit.mpCounts,bridge:auditBridge(audit.documents),subscriptions,
  jobs:records.jobs.map(j=>({...pick(j,jobFields),result:pick(j.result,resultFields)})),rss,sources,documents:[],collection,processing:processingSummary(data),snapshotAt:data.generatedAt,downloadedAt:data.generatedAt};
}

export async function readSensingPage({pool,auditData,readData,collection,shared=false,activity=async()=>({})}){
 const [audit,records,live]=await Promise.all([auditData(),sourceRecords(pool,shared),activity()]);
 return sensingPagePayload({data:readData(),audit,records,collection:{...collection(),...live},shared});
}

// A ready, private source view is separate from the expensive evidence inventory.
// Refreshes replace it atomically; menu reads never wait behind a bulk audit.
export class SensingPageCache{
 constructor({dir,scope,load,identity=()=>'',clock=Date.now,ttl=30000}){Object.assign(this,{dir,scope,load,identity,clock,ttl});this.value=null;this.pending=null;this.error=null;this.epoch=0;}
 async init(){
  if(this.dir)try{const saved=JSON.parse(await fs.readFile(path.join(this.dir,'sensing-page.json'),'utf8'));if(saved.schema===1&&saved.scope===this.scope&&Array.isArray(saved.payload?.subscriptions)&&Array.isArray(saved.payload?.rss?.list)){this.value=saved;this.value.at=0;}}catch{}
  if(this.value)void this.refresh().catch(()=>{});else await this.refresh().catch(()=>{});
 }
 async refresh(){
  if(this.pending)return this.pending;
  const epoch=this.epoch,identity=this.identity();
  const task=(async()=>{
   try{
    const payload=await this.load();if(epoch!==this.epoch)return this.value;
    const version=createHash('sha256').update(JSON.stringify(payload)).digest('hex'),value={schema:1,scope:this.scope,version,payload,identity,at:this.clock()};
    if(this.dir){await fs.mkdir(this.dir,{recursive:true});const file=path.join(this.dir,'sensing-page.json'),tmp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(tmp,JSON.stringify(value),{mode:0o600});await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true});}}
    if(epoch!==this.epoch)return this.value;
    this.value=value;this.error=null;return value;
   }catch(error){this.error='渠道数据更新暂未完成，显示上次成功读取的记录';throw error;}
  })();
  this.pending=task;try{return await task;}finally{if(this.pending===task)this.pending=null;}
 }
 invalidate(){this.epoch++;if(this.value)this.value.at=0;}
 async read({force=false,collection}={}){
  if(force){while(this.pending)await this.pending.catch(()=>{});await this.refresh();}
  else if(!this.value)await this.refresh();
  else if(this.clock()-this.value.at>=this.ttl||this.value.identity!==this.identity())void this.refresh().catch(()=>{});
  if(!this.value)throw Error('渠道数据尚未准备完成');
  return {...this.value.payload,collection:collection?{...this.value.payload.collection,...collection}:this.value.payload.collection,sourceView:{version:this.value.version,refreshing:!!this.pending,error:this.error}};
 }
}
