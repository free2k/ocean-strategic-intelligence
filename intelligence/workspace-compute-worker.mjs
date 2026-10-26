import {parentPort,workerData} from 'node:worker_threads';
import fs from 'node:fs/promises';import path from 'node:path';import pg from 'pg';
import {getQuantCatalog} from './quant-routes.mjs';
import {readStrategyCatalog,safeScope,StrategyRepository} from './strategy/service.mjs';
import {queryData,setRecordRevisions} from './insight-data.mjs';
import {standardTopics} from './industry-topics.mjs';import {countries} from './core.mjs';
import {quantPage} from './workspace-page.mjs';
const {dir,modelReady,databaseUrl}=workerData,repo=new StrategyRepository(dir,{readOnly:true});
const pool=databaseUrl?new pg.Pool({connectionString:databaseUrl,max:1,options:'-c default_transaction_read_only=on',connectionTimeoutMillis:5000,application_name:'workspace-readonly'}):null;
const contexts=new Map();let current=workerData.identity,initial=workerData.snapshot,initialRevisions=workerData.revisions;
if(!initial)try{const seed=JSON.parse(await fs.readFile(path.join(dir,'workspace-input.json'),'utf8'));if(seed.schema===1&&seed.scope===workerData.scope&&Array.isArray(seed.snapshot?.documents)){current=seed.identity;initial=seed.snapshot;initialRevisions=new Map(seed.revisions);}}catch{}
if(initial){if(initialRevisions)setRecordRevisions(initial,initialRevisions);contexts.set(current,initial);}delete workerData.snapshot;initial=null;initialRevisions=null;
parentPort.postMessage({initialized:true,identity:contexts.has(current)?current:null});
const filterOptions=raw=>({topics:standardTopics.map(({id,name})=>({id,name})),countries:countries.map(({code,name})=>({code,name})),sources:raw.sources.map(({id,name})=>({id,name}))});
function context(version=current){const data=contexts.get(version);if(!data)throw Object.assign(Error('资料版本已更新，请刷新后继续查看'),{status:409});return data;}
function store(data){return {data,researchByIds:async ids=>{if(!ids.length)return [];if(pool)return(await pool.query('SELECT payload FROM ocean_intel.research WHERE id=ANY($1::text[])',[ids])).rows.map(r=>r.payload);return(await Promise.all(ids.map(async id=>{if(!/^research_[A-Za-z0-9_-]{1,100}$/.test(id))return null;try{return JSON.parse(await fs.readFile(path.join(dir,'research',id+'.json'),'utf8'));}catch{return null;}}))).filter(Boolean);}};}
async function run({type,params={},snapshot,revisions,identity}){
 if(type==='warm'){
  if(snapshot&&revisions)setRecordRevisions(snapshot,revisions);
  const nextIdentity=snapshot?identity:current,raw=snapshot||context(),catalog=getQuantCatalog(raw,{}),options=filterOptions(catalog),research=await readStrategyCatalog(store(raw),dir,{}, {repository:repo,catalog,client:modelReady?{}:null,model:modelReady?'configured':''});
  const views={'quant:{}':quantPage(catalog,nextIdentity,options),'inventory:{}':{...queryData(raw,{kind:'documents',page:'1',pageSize:'25'}),snapshotAt:raw.generatedAt,filterOptions:options,workspaceView:{version:nextIdentity}},'research:{}':research};
  if(snapshot){const file=path.join(dir,'workspace-input.json'),temporary=file+'.next';await fs.mkdir(dir,{recursive:true});await fs.writeFile(temporary,JSON.stringify({schema:1,scope:workerData.scope,identity,snapshot,revisions:[...(revisions||new Map())]}),{mode:0o600});await fs.rename(temporary,file);contexts.set(identity,snapshot);current=identity;while(contexts.size>2)contexts.delete(contexts.keys().next().value);}
  return {identity:nextIdentity,views};
 }
 const raw=context(params.version),scope=safeScope(params);
 if(type==='inventory')return {...queryData(raw,params),snapshotAt:raw.generatedAt,filterOptions:filterOptions(getQuantCatalog(raw,{})),workspaceView:{version:current}};
 const catalog=getQuantCatalog(raw,scope);
 if(type==='card'){const card=catalog.cards.find(c=>c.id===params.id);if(!card)throw Object.assign(Error('图表不在该资料范围内'),{status:404});return {card,version:params.version||current};}
 if(type==='quant')return quantPage(catalog,current,filterOptions(catalog));
 if(type==='legacy')return catalog;
 if(type==='research')return readStrategyCatalog(store(raw),dir,scope,{repository:repo,catalog,client:modelReady?{}:null,model:modelReady?'configured':''});
 throw Object.assign(Error('读取类型无效'),{status:400});
}
let queue=Promise.resolve();parentPort.on('message',message=>{queue=queue.then(async()=>{try{parentPort.postMessage({id:message.id,value:await run(message)});}catch(e){parentPort.postMessage({id:message.id,error:{message:e.status?e.message:'资料目录暂不可用，请稍后重试',status:e.status||503}});}});});
