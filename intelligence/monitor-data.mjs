import {ResearchLedger,fail} from './research/ledger.mjs';
import {readObjects} from './research/objects.mjs';
import {readMonitorSummary} from './research/monitor-summary.mjs';
import {monitorPeriod} from './research/period-monitor.mjs';
import {publicationDates,eventDates} from './temporal-dates.mjs';
import {monitorFlowEntries} from './public/monitor-overview.js';
import {standardTopics} from './industry-topics.mjs';

const memo=(map,key,read)=>{if(!map.has(key)){if(map.size>=8)map.delete(map.keys().next().value);const pending=Promise.resolve().then(read).catch(e=>{map.delete(key);throw e;});map.set(key,pending);}return map.get(key);};
export function createMonitorLedger(repository){
 const cores=new Map(),snapshots=new Map(),indices=new Map();
 const core=(id,snapshotId)=>memo(cores,id+':'+snapshotId,()=>repository.readMonitorCore?repository.readMonitorCore(id,snapshotId):repository.read(id));
 const view={head:()=>repository.head(),read:id=>repository.read(id),isPublished:repository.isPublished?async id=>repository.isPublished(id):undefined,releaseForSnapshot:id=>repository.releaseForSnapshot(id),
  readObjectIndex:(id,snapshotId)=>memo(indices,id+':'+snapshotId,async()=>{const value=await core(id,snapshotId);if(!value)return value;return {...value,events:value.events.map(e=>{const unique=new Map();for(const v of e.versions){const row=Object.fromEntries(['documentId','occurredAt','publishedAt','dateQuote','scheduledAt'].map(k=>[k,v[k]??null]));unique.set(JSON.stringify(row),row);}return {id:e.id,versions:[...unique.values()]};})};}),
  readMonitorIndex:(id,snapshotId)=>core(id,snapshotId)};
 const ledger=new ResearchLedger(view);
 ledger.snapshot=id=>memo(snapshots,id,async()=>{const snapshot=repository.readMonitorSnapshot?await repository.readMonitorSnapshot(id):await repository.read(id);if(!snapshot||snapshot.kind!=='snapshot')fail('VERSION_NOT_FOUND','Research snapshot does not exist',404);return snapshot;});
 return {ledger,core};
}
export function monitorPreview(core,release,query,id,documentIds=null){
 const object=core.objects.find(o=>o.id===id);if(!object)fail('OBJECT_NOT_FOUND','对象不存在于该版本',404);
 const matches=r=>(!documentIds||documentIds.has(r.documentId))&&r.snapshotId===release.snapshotId&&(!query.topic||r.topic===query.topic)&&(!query.sourceId||r.sourceId===query.sourceId)&&(!query.from||Date.parse(r.publishedAt)>=Date.parse(query.from+'T00:00:00+08:00'))&&(!query.to||Date.parse(r.publishedAt)<Date.parse(query.to+'T00:00:00+08:00')+86400000);
 const members=core.objects.filter(o=>o.id===id||o.mergedInto===id),docs=new Set(members.flatMap(o=>o.documentRefs.map(r=>publicationDates(r))).filter(matches).map(r=>r.documentId));
 if(!object.documentRefs.map(r=>publicationDates(r)).some(matches))fail('OBJECT_SCOPE_MISMATCH','对象不在当前资料范围内',409);
 const eventIds=new Set(members.flatMap(o=>o.eventIds)),factIds=new Set(members.flatMap(o=>o.factIds));
 const data={id:object.id,name:object.name,type:object.type,events:core.events.filter(e=>eventIds.has(e.id)).map(e=>({...e,versions:e.versions.filter(v=>docs.has(v.documentId)).map(v=>eventDates(publicationDates(v)))})).filter(e=>e.versions.length),facts:core.facts.filter(f=>factIds.has(f.id)).map(f=>({...f,versions:f.versions.filter(v=>docs.has(v.documentId))})).filter(f=>f.versions.length)};
 const {latest,previous,fact}=monitorFlowEntries(data);
 return {data:{id:data.id,name:data.name,type:data.type,events:latest?[{id:latest.eventId,versions:[...(previous?[previous]:[]),latest]}]:[],facts:fact?[fact]:[]},meta:{releaseId:release.releaseId,snapshotId:release.snapshotId,registryId:release.objectRegistryId,generatedAt:release.publishedAt,timeBasis:'document_publication',historyPolicy:'matched_documents_all_saved_versions'}};
}

export class MonitorData{
 constructor(repository,{reports}={}){const {ledger,core}=createMonitorLedger(repository);Object.assign(this,{ledger,core,reports});this.summaries=new Map();}
 async context(input){
  const query=Object.fromEntries(Object.entries(input).filter(([,v])=>v!==''&&v!==undefined));
  for(const key of Object.keys(input))if(!['q','type','offset','limit','releaseId','snapshotId','topic','sourceId','from','to','country','periodReportId'].includes(key))fail('INVALID_SCOPE','不支持的监测筛选条件');
  const periodId=query.periodReportId;delete query.periodReportId;const release=await this.ledger.resolveRelease(query);query.releaseId=release.releaseId;
  let period=null;if(periodId){if(!this.reports)fail('PERIOD_NOT_PUBLISHED','简报资料暂不可用',404);period=await monitorPeriod(this.reports,this.ledger,{...query,periodReportId:periodId});}
  return {query,release,period};
 }
 summary({query,release,period}){
  const scope=Object.fromEntries(Object.entries(query).filter(([k])=>!['q','type','offset','limit'].includes(k))),key=JSON.stringify([scope,period?.reportId]);
  return memo(this.summaries,key,()=>readMonitorSummary(this.ledger,scope,period));
 }
 async page(input={}){
  const context=await this.context(input),{query,release,period}=context;
  // Validate scope and page bounds using the same reader as the full archive.
  const objects=await readObjects(this.ledger,query,null,period?.documentIds||null);
  const [summary,snapshot,core]=await Promise.all([this.summary(context),this.ledger.snapshot(release.snapshotId),this.core(release.objectRegistryId,release.snapshotId)]);
  const candidate=objects.data.find(o=>o.events>0),preview=candidate?monitorPreview(core,release,query,candidate.id,period?.documentIds||null):{meta:objects.meta};
  const refs=core.objects.flatMap(o=>o.documentRefs),sourceIds=new Set(refs.map(r=>r.sourceId).filter(Boolean)),sourceNames=new Map((snapshot.sources||[]).map(s=>[s.id,s.name]));
  return {objects,preview,summary,meta:objects.meta,options:{topics:standardTopics.filter(t=>refs.some(r=>r.topic===t.id)).map(t=>({id:t.id,name:t.name})),sources:[...sourceIds].map(id=>({id,name:sourceNames.get(id)||id})).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))}};
 }
 async scopeSummary(input){return this.summary(await this.context(input));}
}
