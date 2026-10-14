import {standardTopics,canonicalTopic} from '../industry-topics.mjs';
import {countClassification,fail,digest} from './ledger.mjs';
import {normalizeScope} from './scope.mjs';

// Read recorded decisions only. Replay must never run today's rules over old bodies.
export async function readBatchReplay(ledger,versions={}){
 const {release,snapshot}=await ledger.resolve(versions),batch=await ledger.batch(release.batchId);
 if(versions.country)fail('UNSUPPORTED_SCOPE','历史快照尚未保存完整国家角色，请清除国家筛选后查看批次回放');
 const scope=normalizeScope({topic:versions.topic,sourceIds:versions.sourceId,periodStart:versions.from,periodEndExclusive:versions.to?endDate(versions.to):null});
 const entries=snapshot.entries.filter(e=>(!scope.topic||canonicalTopic(e.classification?.primary)===canonicalTopic(scope.topic))&&(!scope.sourceIds.length||scope.sourceIds.includes(e.body.sourceId))&&(!scope.periodStart||e.body.publishedAt&&Date.parse(e.body.publishedAt)>=Date.parse(scope.periodStart))&&(!scope.periodEndExclusive||e.body.publishedAt&&Date.parse(e.body.publishedAt)<Date.parse(scope.periodEndExclusive)));
 const changed=new Map(batch.changes.map(c=>[c.documentId,c]));
 const topics=new Set(standardTopics.map(t=>t.id));
 const candidates=entries.filter(e=>changed.has(e.documentId)).map(e=>{
  const c=e.classification||{},positive=Array.isArray(c.positive)?c.positive:[],negative=Array.isArray(c.negative)?c.negative:[];
  const topic=canonicalTopic(c.primary||positive.find(p=>topics.has(canonicalTopic(p.topic)))?.topic);
  const keyword=k=>typeof k==='string'?k:typeof k?.keyword==='string'?k.keyword:'';
  const hasPositive=positive.some(p=>p.keywords?.some(k=>keyword(k).trim()));
  if(!topics.has(topic)||!hasPositive||!['accepted','excluded'].includes(c.status)||c.status==='excluded'&&!negative.some(k=>keyword(k).trim()))return null;
  return {documentId:e.documentId,bodyVersionId:e.bodyVersionId,classificationVersionId:e.classificationVersionId,title:e.body.titleZh||e.body.title,sourceId:e.body.sourceId,publishedAt:e.body.publishedAt,topic,classification:c,changeTypes:changed.get(e.documentId).types,
   evidenceUrl:`/api/document/${encodeURIComponent(e.documentId)}/versions/${e.bodyVersionId}?releaseId=${encodeURIComponent(release.releaseId)}`};
 }).filter(Boolean).sort((a,b)=>a.documentId.localeCompare(b.documentId));
 const selected=[];
 // First cover primary domains; fill remaining slots by channel/status/change diversity.
 for(const topic of standardTopics){const candidate=candidates.find(c=>c.classification.status==='accepted'&&canonicalTopic(c.classification.primary)===topic.id);if(candidate)selected.push(candidate);}
 while(selected.length<6){
  const remaining=candidates.filter(c=>!selected.includes(c));if(!remaining.length)break;
  const score=c=>Number(!selected.some(s=>s.sourceId===c.sourceId))+Number(!selected.some(s=>s.classification.status===c.classification.status))+Number(!selected.some(s=>s.topic===c.topic))+Number(c.changeTypes.some(type=>!selected.some(s=>s.changeTypes.includes(type))));
  remaining.sort((a,b)=>score(b)-score(a)||a.documentId.localeCompare(b.documentId));selected.push(remaining[0]);
 }
 const affected=entries.filter(e=>changed.has(e.documentId)),asDocs=rows=>rows.map(e=>({id:e.documentId,industry:e.classification?{...e.classification,primary:e.classification.primary?canonicalTopic(e.classification.primary):null}:null}));
 const counts={affectedDocuments:affected.length,changes:Object.fromEntries(Object.keys(batch.counts.changes).map(type=>[type,affected.filter(e=>changed.get(e.documentId).types.includes(type)).length])),processedClassification:countClassification(asDocs(affected)),snapshotClassification:countClassification(asDocs(entries))};
 const documents=entries.map(e=>({id:e.documentId,title:e.body.titleZh||e.body.title||'无标题',sourceId:e.body.sourceId,publishedAt:e.body.publishedAt,classification:e.classification,bodyVersionId:e.bodyVersionId}));
 return {data:{kind:batch.baseline?'migration_baseline':'processed_batch',label:batch.baseline?'迁移基线回看':'处理批次回放',samples:selected,documents,sources:snapshot.sources,eligibleDocuments:candidates.length,omittedFromReplay:affected.length-candidates.length,counts,
  playback:{sampleSeconds:12,phases:[{id:'source',seconds:2},{id:'processing',seconds:6},{id:'result',seconds:4}],loop:false},emptyReason:selected.length?null:'NO_RECORDED_KEYWORD_CASES'},
  meta:{releaseId:release.releaseId,snapshotId:release.snapshotId,batchId:release.batchId,generatedAt:release.publishedAt,ruleVersion:snapshot.ruleVersion,completeness:release.completeness,scope:{collection:'batch_affected_documents',filters:scope,scopeHash:digest(scope)},replayOnly:true}};
}
function endDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))fail('INVALID_SCOPE','截止日期必须是 YYYY-MM-DD');normalizeScope({periodStart:value});const d=new Date(value+'T00:00:00+08:00');d.setUTCDate(d.getUTCDate()+1);return d.toISOString();}
