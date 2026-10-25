import {canonicalDigest} from './canonical-hash.mjs';
import {snapshotRules} from '../published-rules.mjs';

// Content-addressed records preserve the state actually observed, never inferred history.
export function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])]));
 return value;
}
export const digest=canonicalDigest;
export class LedgerError extends Error{constructor(code,message,status=400){super(message);this.code=code;this.status=status;}}
export function fail(code,message,status){throw new LedgerError(code,message,status);}
const classification=d=>d.industry||null;
const structure=(data,id)=>Object.fromEntries(['events','relations','observations','evidence'].map(key=>[key,(data[key]||[]).filter(r=>r.documentId===id).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)))]));
function indexDocuments(documents){
 if(!Array.isArray(documents))fail('INVALID_SNAPSHOT','documents must be an array');
 const map=new Map();for(const d of documents){if(typeof d.id!=='string'||!d.id)fail('INVALID_DOCUMENT','Every document needs its original ID');if(map.has(d.id))fail('DUPLICATE_DOCUMENT','Duplicate document ID: '+d.id);map.set(d.id,d);}return map;
}
export function countClassification(documents){
 const rows=[...indexDocuments(documents).values()],counts={total:rows.length,accepted:0,excluded:0,unmatched:0,unclassified:0,primaryTopics:{},acceptedWithoutPrimary:0};
 for(const d of rows){const c=classification(d),status=['accepted','excluded','unmatched'].includes(c?.status)?c.status:'unclassified';counts[status]++;if(status==='accepted'){if(c.primary)counts.primaryTopics[c.primary]=(counts.primaryTopics[c.primary]||0)+1;else counts.acceptedWithoutPrimary++;}}
 return counts;
}
function versionRecord(data,d){
 // Preserve original version ID separately: classifications can change without a new body ID.
 const body={documentId:d.id,originalVersionId:d.versionId??null,title:d.title??null,titleZh:d.titleZh??null,content:d.content??null,contentZh:d.contentZh??null,url:d.url??null,sourceId:d.sourceId??null,publishedAt:d.publishedAt??null,uploadId:d.uploadId??null};
 const facts=structure(data,d.id);
 const {originalVersionId,...bodyContent}=body;
 return {documentId:d.id,bodyVersionId:'body_'+digest(bodyContent),classificationVersionId:'classification_'+digest({documentId:d.id,classification:classification(d),ruleVersion:data.industryRuleVersion}),structureVersionId:'structure_'+digest(facts),body,classification:classification(d),facts};
}
export function prepareSnapshot(data,previous,{baseline=false,trigger='manual_snapshot',taskIds=[],startedAt=null,completeness='complete',errors=[]}={}){
 indexDocuments(data.documents);
 if(!data.industryRuleVersion||data.industryRulePublication?.source!=='database')fail('RULES_UNAVAILABLE','Published database rule provenance is required',503);
 try{snapshotRules(data);}catch{fail('RULES_UNAVAILABLE','Published database rules are missing or inconsistent',503);}
 if(!['complete','partial'].includes(completeness))fail('INVALID_COMPLETENESS','Unknown completeness');
 const entries=data.documents.map(d=>versionRecord(data,d)).sort((a,b)=>a.documentId.localeCompare(b.documentId));
 const old=new Map((previous?.entries||[]).map(d=>[d.documentId,d]));
 const changes=[];for(const d of entries){const before=old.get(d.documentId),types=[];
  if(!before)types.push(baseline?'baseline':'new_document');
  else{if(before.bodyVersionId!==d.bodyVersionId)types.push('body_updated');if(before.classificationVersionId!==d.classificationVersionId)types.push('classification_changed');if(before.structureVersionId!==d.structureVersionId)types.push('structure_changed');}
  if(types.length)changes.push({documentId:d.documentId,types,before:before?{bodyVersionId:before.bodyVersionId,classificationVersionId:before.classificationVersionId,structureVersionId:before.structureVersionId}:null,after:{bodyVersionId:d.bodyVersionId,classificationVersionId:d.classificationVersionId,structureVersionId:d.structureVersionId}});
 }
 // Missing records are retained in history, but never interpreted as deletions or real-world termination.
 const present=new Set(entries.map(d=>d.documentId)),absent=[...old.keys()].filter(id=>!present.has(id));
 const affected=new Set(changes.map(c=>c.documentId));
 const snapshot={entries,sources:data.sources||[],entities:data.entities||[],ruleVersion:data.industryRuleVersion,rulePublication:data.industryRulePublication,ruleConfig:data.industryRuleConfig,observedAt:data.generatedAt??null,completeness};
 const snapshotId='snapshot_'+digest(snapshot);
 const batch={snapshotId,baseSnapshotId:previous?.snapshotId||null,trigger,taskIds:[...new Set(taskIds)].sort(),startedAt,baseline,changes,absentDocumentIds:absent,errors,completeness,counts:{affectedDocuments:affected.size,changes:Object.fromEntries(['baseline','new_document','body_updated','classification_changed','structure_changed'].map(type=>[type,changes.filter(c=>c.types.includes(type)).length])),processedClassification:countClassification(data.documents.filter(d=>affected.has(d.id))),snapshotClassification:countClassification(data.documents)}};
 return {snapshotId,snapshot,batch};
}
export class ResearchLedger{
 constructor(repository){this.repository=repository;}
 async latest(){const head=await this.repository.head();if(!head)return null;return this.release(head.releaseId);}
 async release(id){const r=await this.repository.read(id);if(!r||r.kind!=='release'||this.repository.isPublished&&!await this.repository.isPublished(id))fail('VERSION_NOT_FOUND','Research release does not exist',404);return r;}
 async snapshot(id){const r=await this.repository.read(id);if(!r||r.kind!=='snapshot')fail('VERSION_NOT_FOUND','Research snapshot does not exist',404);return r;}
 async resolveRelease({releaseId,snapshotId}={}){
  let release;if(releaseId)release=await this.release(releaseId);else if(snapshotId){const id=await this.repository.releaseForSnapshot(snapshotId);if(!id)fail('VERSION_NOT_FOUND','No release for this snapshot',404);release=await this.release(id);}else release=await this.latest();
  if(!release)fail('RESEARCH_NOT_INITIALIZED','Research baseline has not been published',503);
  if(snapshotId&&snapshotId!==release.snapshotId)fail('VERSION_CONFLICT','Release and snapshot do not match',409);
  return release;
 }
 async resolve(versions={}){const release=await this.resolveRelease(versions);return {release,snapshot:await this.snapshot(release.snapshotId)};}
 async publish(data,{expectedReleaseId,baseline=false,...options}={}){
  if(expectedReleaseId===undefined)fail('EXPECTED_VERSION_REQUIRED','Pass the expected release ID, or null for the initial baseline');
  const head=await this.repository.head();if((head?.releaseId||null)!==expectedReleaseId)fail('VERSION_CONFLICT','Latest research release changed',409);
  if(!head&&!baseline)fail('BASELINE_REQUIRED','The first capture must be explicitly marked as a baseline');
  if(head&&baseline)fail('BASELINE_EXISTS','A baseline already exists',409);
  const previous=head?(this.repository.readSnapshotComparison?await this.repository.readSnapshotComparison(head.snapshotId):await this.snapshot(head.snapshotId)):null;
  if(head&&previous?.kind!=='snapshot')fail('VERSION_NOT_FOUND','Research snapshot does not exist',404);
  const prepared=prepareSnapshot(data,previous?{...previous,snapshotId:head.snapshotId}:null,{...options,baseline});
  if(head?.snapshotId===prepared.snapshotId)return {...await this.release(head.releaseId),unchanged:true};
  const at=new Date().toISOString(),batchId='batch_'+digest({...prepared.batch,publishedAt:at}),snapshot={kind:'snapshot',...prepared.snapshot};
  const release={kind:'release',snapshotId:prepared.snapshotId,batchId,previousReleaseId:expectedReleaseId,publishedAt:at,ruleVersion:snapshot.ruleVersion,completeness:snapshot.completeness,productStatus:'deferred',productReason:'RESEARCH_GENERATION_NOT_CONNECTED',products:[]};
  const releaseId='release_'+digest(release);release.releaseId=releaseId;
  await this.repository.commit({expectedReleaseId,head:{releaseId,snapshotId:prepared.snapshotId},records:{[prepared.snapshotId]:snapshot,[batchId]:{kind:'batch',...prepared.batch,batchId,publishedAt:at},[releaseId]:release}});
  return release;
 }
 async batch(id){const record=await this.repository.read(id);if(!record||record.kind!=='batch')fail('BATCH_NOT_FOUND','Batch does not exist',404);return record;}
 async document(id,versionId,versions={}){
  const {release,snapshot}=await this.resolve(versions),entry=snapshot.entries.find(d=>d.documentId===id);
  if(!entry||entry.bodyVersionId!==versionId)fail('DOCUMENT_VERSION_NOT_FOUND','Version is not part of this document and snapshot',404);
  return {data:{...entry.body,classification:entry.classification,evidence:entry.facts.evidence,events:entry.facts.events,relations:entry.facts.relations,observations:entry.facts.observations},meta:{snapshotId:release.snapshotId,releaseId:release.releaseId,batchId:release.batchId,ruleVersion:snapshot.ruleVersion}};
 }
}
