import {publicationDates,eventDates} from '../temporal-dates.mjs';
import {readDossier} from './dossier-products.mjs';
import {digest,fail} from './ledger.mjs';
const uniq=a=>[...new Set(a)];
const normalized=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();
const objectId=id=>'object_'+digest({legacyEntityId:id});
const empty=()=>({objects:[],entityMap:{},events:[],eventMap:{},relations:[],facts:[],operations:[],appliedSnapshots:[]});
export function buildObjects(snapshot,batch,release,previous=null){
 const result=structuredClone(previous||empty());delete result.kind;
 if(result.appliedSnapshots.includes(release.snapshotId))return result;
 const objects=new Map(result.objects.map(o=>[o.id,o])),events=new Map(result.events.map(e=>[e.id,e])),relations=new Map(result.relations.map(r=>[r.id,r])),facts=new Map(result.facts.map(f=>[f.id,f]));
 const entryMap=new Map(snapshot.entries.map(e=>[e.documentId,e])),evidence=new Map(snapshot.entries.flatMap(e=>e.facts.evidence.map(v=>[v.id,{...v,entry:e}])));
 const at=release.publishedAt,changes=new Map(batch.changes.map(c=>[c.documentId,c.types]));
 for(const e of snapshot.entities){
  if(!e.id)continue;if(typeof e.id!=='string'||['__proto__','constructor','prototype'].includes(e.id))fail('INVALID_ENTITY_ID','原始实体标识不合法');const id=result.entityMap[e.id]||objectId(e.id);result.entityMap[e.id]=id;
  let o=objects.get(id);if(!o){o={id,type:e.type||'其他',name:e.nameZh||e.name||'未命名对象',aliases:[],legacyIds:[],firstSeenAt:at,firstSnapshotId:release.snapshotId,documentRefs:[],factIds:[],eventIds:[],relationIds:[],metrics:[],mergedInto:null};objects.set(id,o);}
  o.aliases=uniq([...o.aliases,e.name,e.nameZh].filter(Boolean));o.legacyIds=uniq([...o.legacyIds,e.id]);o.lastSeenAt=at;o.lastSnapshotId=release.snapshotId;
  if(e.type&&o.type!==e.type)o.identityWarning='原始实体类型发生变化，需人工核对';
  for(const id of e.evidenceIds||[]){const ev=evidence.get(id);if(ev)attach(o,ev.entry,[id]);}
 }
 function ref(entry){return {documentId:entry.documentId,bodyVersionId:entry.bodyVersionId,releaseId:release.releaseId,snapshotId:release.snapshotId,title:entry.body.titleZh||entry.body.title,publishedAt:entry.body.publishedAt,sourceId:entry.body.sourceId,topic:entry.classification?.primary||null};}
 function attach(o,entry,evidenceIds){if(!o)return;const r=ref(entry);if(!o.documentRefs.some(x=>x.bodyVersionId===r.bodyVersionId&&x.snapshotId===r.snapshotId))o.documentRefs.push(r);
  for(const evId of evidenceIds||[]){const ev=evidence.get(evId);if(!ev||ev.entry.documentId!==entry.documentId||!ev.quote||![entry.body.content,entry.body.contentZh,entry.body.title,entry.body.titleZh].filter(Boolean).some(t=>t.includes(ev.quote)))continue;
   const id='fact_'+digest({documentId:entry.documentId,quote:ev.quote});let f=facts.get(id);if(!f){f={id,quote:ev.quote,firstSeenAt:at,versions:[],objectIds:[]};facts.set(id,f);}f.objectIds=uniq([...f.objectIds,o.id]);if(!f.versions.some(v=>v.bodyVersionId===entry.bodyVersionId))f.versions.push({...r,evidenceId:ev.id});o.factIds=uniq([...o.factIds,id]);
  }
 }
 for(const entry of snapshot.entries){
  for(const event of entry.facts.events){
   const ids=uniq((event.entityIds||[]).map(id=>result.entityMap[id]).filter(Boolean)).sort(),key=entry.documentId+'|'+event.id;
   const quotes=(event.evidenceIds||[]).map(id=>evidence.get(id)?.quote).filter(Boolean).map(normalized).sort();
   // Ambiguous changed assertions remain separate candidates, never asserted as real-world change.
   const id=result.eventMap[key]||'event_'+digest({documentId:entry.documentId,type:event.type,occurredAt:event.eventDate||null,objects:ids,assertions:quotes.length?quotes:normalized(event.title)});result.eventMap[key]=id;
   let item=events.get(id);if(!item){item={id,firstSeenAt:at,legacyIds:[],versions:[],objectIds:ids};events.set(id,item);}item.legacyIds=uniq([...item.legacyIds,event.id]);item.objectIds=uniq([...item.objectIds,...ids]);
   const version={...ref(entry),title:event.title,type:event.type,summary:event.summary,occurredAt:event.eventDate||null,scheduledAt:event.scheduledAt||null,dateRole:event.dateRole||null,dateQuote:event.dateQuote||null,dateEvidenceIds:event.dateEvidenceIds||[],dateBasis:event.dateBasis||'发生日期未明确',status:event.status||'candidate',observedAt:at,changeTypes:batch.baseline?['baseline']:changes.get(entry.documentId)||[],evidenceIds:event.evidenceIds||[]};
   const versionKey=digest({body:entry.bodyVersionId,structure:entry.structureVersionId,event});if(!item.versions.some(v=>v.versionKey===versionKey))item.versions.push({...version,versionKey});
   for(const oid of ids){const o=objects.get(oid);o.eventIds=uniq([...o.eventIds,id]);attach(o,entry,event.evidenceIds);}
  }
  for(const relation of entry.facts.relations){
   const from=result.entityMap[relation.from],to=result.entityMap[relation.to];if(!from||!to)continue;
   const id='relation_'+digest({from,to,type:relation.type||'未明确'});let r=relations.get(id);if(!r){r={id,from,to,type:relation.type||'未明确',firstSeenAt:at,versions:[],legacyIds:[]};relations.set(id,r);}r.legacyIds=uniq([...r.legacyIds,relation.id]);
   const key=digest({body:entry.bodyVersionId,relation});if(!r.versions.some(v=>v.versionKey===key))r.versions.push({...ref(entry),versionKey:key,status:relation.status||'candidate',method:relation.method||null,observedAt:at,evidenceIds:relation.evidenceIds||[]});
   for(const oid of [from,to]){const o=objects.get(oid);o.relationIds=uniq([...o.relationIds,id]);attach(o,entry,relation.evidenceIds);}
  }
  // A subject name alone is not an identity binding; only explicit entity IDs attach metrics.
  for(const metric of entry.facts.observations){const o=objects.get(result.entityMap[metric.entityId||metric.subjectId]);if(!o)continue;const id='metric_'+digest({documentId:entry.documentId,metric});if(!o.metrics.some(m=>m.id===id))o.metrics.push({id,...metric,reference:ref(entry)});}
 }
 result.objects=[...objects.values()];result.events=[...events.values()];result.relations=[...relations.values()];result.facts=[...facts.values()];result.appliedSnapshots.push(release.snapshotId);return result;
}
export function mergeObjects(registry,{targetId,sourceId,reason,factIds,actor}){
 const next=structuredClone(registry),target=next.objects.find(o=>o.id===targetId),source=next.objects.find(o=>o.id===sourceId);
 if(!target||!source||source===target||source.mergedInto||target.mergedInto||target.type!==source.type||!reason?.trim()||!actor?.trim()||!Array.isArray(factIds)||!factIds.length||factIds.some(id=>!next.facts.some(f=>f.id===id)))fail('INVALID_MERGE','合并需要同类型对象、明确依据及操作者；不按同名自动合并');
 if(next.objects.some(o=>o.mergedInto===sourceId))fail('DEPENDENT_MERGE','请先撤销来源对象已有的合并，再重新核对身份',409);
 const cited=next.facts.filter(f=>factIds.includes(f.id));if(!cited.some(f=>f.objectIds.includes(sourceId))||!cited.some(f=>f.objectIds.includes(targetId))||cited.some(f=>!f.objectIds.includes(sourceId)&&!f.objectIds.includes(targetId)))fail('INVALID_MERGE_EVIDENCE','合并依据必须覆盖这两个对象，不能引用无关资料');
 const op={id:'merge_'+digest({targetId,sourceId,reason,factIds,actor,index:next.operations.length}),targetId,sourceId,reason,factIds,actor,at:new Date().toISOString(),reverted:false};source.mergedInto=targetId;next.operations.push(op);return next;
}
export function undoMerge(registry,{operationId,actor,reason}){const next=structuredClone(registry),op=next.operations.find(o=>o.id===operationId);if(!op||op.reverted||!actor?.trim()||!reason?.trim())fail('INVALID_UNDO','撤销必须指定有效合并记录、操作者和原因');if(next.objects.some(o=>o.id===op.targetId&&o.mergedInto))fail('DEPENDENT_MERGE','请先撤销依赖此合并的后续操作',409);next.objects.find(o=>o.id===op.sourceId).mergedInto=null;op.reverted=true;op.revertedBy=actor;op.revertedAt=new Date().toISOString();op.revertReason=reason;return next;}
export async function publishObjects(ledger,expectedReleaseId){
 const release=await ledger.resolveRelease({releaseId:expectedReleaseId}),snapshot=await ledger.snapshot(release.snapshotId),batch=await ledger.batch(release.batchId);
 let prior=release,old=null;while(prior){if(prior.objectRegistryId){old=await ledger.repository.read(prior.objectRegistryId);if(old?.kind!=='registry')fail('REGISTRY_NOT_FOUND','历史对象档案缺失，不能重建并覆盖身份映射',409);break;}prior=prior.previousReleaseId?await ledger.release(prior.previousReleaseId):null;}
 const registry={...buildObjects(snapshot,batch,release,old),kind:'registry'},id='registry_'+digest(registry);if(release.objectRegistryId===id)return {...release,unchanged:true};
 const {releaseId,...rest}=release,next={...rest,objectRegistryId:id,previousReleaseId:releaseId,publishedAt:new Date().toISOString()};next.releaseId='release_'+digest(next);
 await ledger.repository.commit({expectedReleaseId,head:{releaseId:next.releaseId,snapshotId:next.snapshotId},records:{[id]:registry,[next.releaseId]:next}});return next;
}
const objectListCaches=new WeakMap();
export async function readObjects(ledger,query={},id=null,documentIds=null){
 const allowed=new Set(['releaseId','snapshotId','q','type','topic','sourceId','from','to','country','offset','limit']);for(const key of Object.keys(query))if(!allowed.has(key))fail('INVALID_SCOPE','不支持的对象筛选条件');
 if(query.country)fail('OBJECT_SCOPE_UNAVAILABLE','国家角色尚未接入对象档案，请清除国家筛选后查看');
 const day=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))fail('INVALID_SCOPE','日期必须是 YYYY-MM-DD');const [y,m,d]=value.split('-').map(Number);if(m<1||m>12||d<1||d>new Date(Date.UTC(y,m,0)).getUTCDate())fail('INVALID_SCOPE','日期无效');return Date.parse(value+'T00:00:00+08:00');};
 const start=query.from?day(query.from):null,end=query.to?day(query.to)+86400000:null;
 if(start!==null&&end!==null&&start>=end)fail('INVALID_SCOPE','截止日期不能早于起始日期');
 const release=await ledger.resolveRelease(query);if(!release.objectRegistryId)fail('OBJECTS_NOT_INITIALIZED','此发布版本尚未建立对象档案',503);
 const limit=Number(query.limit||12),offset=Number(query.offset||0);if(!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(offset)||offset<0)fail('INVALID_PAGINATION','分页参数无效');
 const meta={releaseId:release.releaseId,snapshotId:release.snapshotId,registryId:release.objectRegistryId,generatedAt:release.publishedAt,timeBasis:'document_publication',historyPolicy:'matched_documents_all_saved_versions'};
 let cache=objectListCaches.get(ledger.repository);if(!cache){cache=new Map();objectListCaches.set(ledger.repository,cache);}
 const cacheKey=JSON.stringify([release.objectRegistryId,release.snapshotId,query.topic||'',query.sourceId||'',query.from||'',query.to||'',documentIds?[...documentIds].sort():null]);
 const filterRows=rows=>rows.filter(o=>(!query.type||o.type===query.type)&&(!query.q||[o.name,...o.aliases].join(' ').toLowerCase().includes(query.q.trim().toLowerCase())));
 if(!id&&cache.has(cacheKey)){const rows=filterRows(cache.get(cacheKey));return {data:structuredClone(rows.slice(offset,offset+limit)),total:rows.length,offset,limit,meta};}
 const storedRegistry=id&&ledger.repository.readObjectDetail?await ledger.repository.readObjectDetail(release.objectRegistryId,id):!id&&ledger.repository.readObjectIndex?await ledger.repository.readObjectIndex(release.objectRegistryId,release.snapshotId):await ledger.repository.read(release.objectRegistryId);const registry=storedRegistry?{...storedRegistry}:null;if(!registry||registry.kind!=='registry')fail('REGISTRY_NOT_FOUND','对象档案版本不存在',404);
 registry.objects=registry.objects.map(o=>({...o,documentRefs:o.documentRefs.map(r=>publicationDates(r))}));
 registry.events=registry.events.map(e=>({...e,versions:e.versions.map(v=>eventDates(publicationDates(v)))}));
 const matches=r=>(!documentIds||documentIds.has(r.documentId))&&r.snapshotId===release.snapshotId&&(!query.topic||r.topic===query.topic)&&(!query.sourceId||r.sourceId===query.sourceId)&&(start===null||Date.parse(r.publishedAt)>=start)&&(end===null||Date.parse(r.publishedAt)<end);
 const visible=o=>o.documentRefs.some(matches);
 if(id){const object=registry.objects.find(o=>o.id===id);if(!object)fail('OBJECT_NOT_FOUND','对象不存在于该版本',404);if(!visible(object))fail('OBJECT_SCOPE_MISMATCH','对象不在当前资料范围内',409);
  const members=registry.objects.filter(o=>o.id===id||o.mergedInto===id),eventIds=uniq(members.flatMap(o=>o.eventIds)),relIds=uniq(members.flatMap(o=>o.relationIds)),factIds=uniq(members.flatMap(o=>o.factIds));
  const docs=new Set(members.flatMap(o=>o.documentRefs).filter(matches).map(r=>r.documentId));
  const scoped=rows=>rows.map(r=>({...r,versions:r.versions.filter(v=>docs.has(v.documentId))})).filter(r=>r.versions.length);
  return {data:{...object,documentRefs:object.documentRefs.filter(r=>docs.has(r.documentId)),members:members.map(o=>({id:o.id,name:o.name})),events:scoped(registry.events.filter(e=>eventIds.includes(e.id))),relations:scoped(registry.relations.filter(r=>relIds.includes(r.id))).map(r=>({...r,fromName:registry.objects.find(o=>o.id===r.from)?.name,toName:registry.objects.find(o=>o.id===r.to)?.name})),facts:scoped(registry.facts.filter(f=>factIds.includes(f.id))),metrics:members.flatMap(o=>o.metrics).filter(m=>docs.has(m.reference.documentId)),assessments:(!documentIds&&!query.topic&&!query.sourceId&&!query.from&&!query.to)?[await readDossier(ledger,release,{kind:'object',objectId:id})].filter(Boolean):[],identityHistory:registry.operations.filter(o=>o.sourceId===id||o.targetId===id)},meta};
 }
 const eventIndex=new Map(registry.events.map(e=>[e.id,e]));
 const time=v=>Number.isFinite(Date.parse(v))?Date.parse(v):0;
 const rows=registry.objects.filter(o=>!o.mergedInto&&visible(o)).map(o=>{
  const refs=o.documentRefs.filter(matches),docs=new Set(refs.map(r=>r.documentId));
  const events=o.eventIds.map(id=>eventIndex.get(id)).filter(e=>e?.versions.some(v=>docs.has(v.documentId)));
  const latest=events.flatMap(e=>e.versions.filter(v=>docs.has(v.documentId))).sort((a,b)=>time(b.occurredAt||b.publishedAt)-time(a.occurredAt||a.publishedAt)||time(b.publishedAt)-time(a.publishedAt))[0];
  const latestPublishedAt=refs.map(r=>r.publishedAt).sort((a,b)=>time(b)-time(a))[0]||null;
  return {id:o.id,name:o.name,type:o.type,aliases:o.aliases,identityWarning:o.identityWarning||null,documents:docs.size,events:events.length,firstSeenAt:o.firstSeenAt,latestEventAt:latest?.occurredAt||null,latestPublishedAt:latest?.publishedAt||latestPublishedAt,latestActivityAt:latest?.occurredAt||latest?.publishedAt||latestPublishedAt};
 }).sort((a,b)=>Number(b.events>0)-Number(a.events>0)||time(b.latestActivityAt)-time(a.latestActivityAt)||a.id.localeCompare(b.id));
 if(cache.size>=8)cache.delete(cache.keys().next().value);cache.set(cacheKey,rows);
 const filtered=filterRows(rows);return {data:structuredClone(filtered.slice(offset,offset+limit)),total:filtered.length,offset,limit,meta};
}
