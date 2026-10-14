import {digest,fail} from './ledger.mjs';
import {validateBrief} from './brief-products.mjs';
import {reviewMatches} from './semantic-review.mjs';
export const dossierFields={公司:['注册地','控制股东','业务角色'],项目:['所在地','技术路线','项目阶段','设计规模','实际产出'],设施:['设施类别','所在地','运行状态','设计能力'],技术:['技术路线','成熟度','应用场景']};
export function validateDossierContent(content,entries){
 const result=validateBrief(content,entries,{minItems:1}),errors=result.errors.filter(e=>e!=='DUPLICATE_FACT');
 // One passage can support distinct dossier fields. Deduplicate assertions, not shared source passages.
 const assertions=(content?.items||[]).map(i=>JSON.stringify([i.kind,i.field||null,i.value||null,i.title,i.analysis]));if(new Set(assertions).size!==assertions.length)errors.push('DUPLICATE_ASSERTION');
 return {ok:!errors.length,errors};
}
export async function dossierInputs(ledger,release,scope){
 const snapshot=await ledger.snapshot(release.snapshotId);
 if(scope.kind==='object'){
  const registry=release.objectRegistryId?await ledger.repository.read(release.objectRegistryId):null,object=registry?.objects.find(o=>o.id===scope.objectId&&!o.mergedInto);
  if(!object)fail('OBJECT_NOT_FOUND','对象不属于当前发布版本',404);
  const ids=new Set(object.documentRefs.filter(r=>r.snapshotId===release.snapshotId).map(r=>r.documentId));return {subject:object.name,type:object.type,entries:snapshot.entries.filter(e=>ids.has(e.documentId))};
 }
 if(scope.kind==='country'){
  if(!Array.isArray(scope.countryCodes)||!scope.countryCodes.length||scope.countryCodes.some(c=>!/^([A-Z]{2})$/.test(c)))fail('INVALID_SCOPE','国别研判需要明确国家集合');
  const registry=release.countryRegistryId?await ledger.repository.read(release.countryRegistryId):null;if(!registry)fail('COUNTRIES_NOT_INITIALIZED','国别注册表尚未发布');
  const events=registry.events.filter(e=>e.countries.some(c=>scope.countryCodes.includes(c))),ids=new Set(events.flatMap(e=>e.references.map(r=>r.documentId)));
  return {subject:[...scope.countryCodes].sort().join(','),type:'country',entries:snapshot.entries.filter(e=>ids.has(e.documentId))};
 }
 fail('INVALID_SCOPE','未知研判范围');
}
export function dossierKey(scope){return digest(scope.kind==='object'?{kind:'object',objectId:scope.objectId}:{kind:'country',countryCodes:[...new Set(scope.countryCodes)].sort()});}
export async function publishDossier(ledger,product,expectedReleaseId){
 const release=await ledger.resolveRelease({releaseId:expectedReleaseId});if(product.snapshotId!==release.snapshotId)fail('VERSION_CONFLICT','研判输入快照已变化',409);
 const allowed=product.scope?.kind==='object'?['kind','objectId']:['kind','countryCodes'];if(!product.scope||Object.keys(product.scope).some(k=>!allowed.includes(k)))fail('INVALID_SCOPE','研判范围不完整');
 const input=await dossierInputs(ledger,release,product.scope),check=validateDossierContent(product.content,input.entries);if(!check.ok)fail('PRODUCT_VALIDATION_FAILED',check.errors.join(', '));
 if(product.subject!==input.subject||!product.configVersion)fail('INVALID_SUBJECT','研判对象与配置版本必须明确');
 for(const item of product.content.items){
  if(!['finding','counterevidence','field'].includes(item.kind))fail('INVALID_ASSESSMENT','结论须区分发现、反证与字段');
  if(item.kind==='field'){
   if(product.scope.kind!=='object'||!(dossierFields[input.type]||[]).includes(item.field)||typeof item.value!=='string'||!item.value||!item.references.some(r=>r.quote.includes(item.value)))fail('UNSUPPORTED_FIELD','专属字段必须由原文直接支持');
   if(item.effectiveAt&&(!/^\d{4}-\d{2}-\d{2}$/.test(item.effectiveAt)||!Number.isFinite(Date.parse(item.effectiveAt))||new Date(item.effectiveAt).toISOString().slice(0,10)!==item.effectiveAt))fail('INVALID_ASSESSMENT','阶段日期格式无效');
   if(item.effectiveAt&&!item.references.some(r=>r.quote.includes(item.effectiveAt)))fail('UNSUPPORTED_STAGE_DATE','阶段时间须明确绑定原文；未知时留空');
  }
 }
 if(!['provided','not_found_in_scope'].includes(product.content.counterevidenceStatus)||!product.content.counterevidenceNote?.trim())fail('COUNTEREVIDENCE_REQUIRED','必须说明反证和搜索范围内缺口');
 if(product.content.counterevidenceStatus==='provided'&&!product.content.items.some(i=>i.kind==='counterevidence'))fail('COUNTEREVIDENCE_REQUIRED','不能仅声明存在反证而不提供依据');
 if(!reviewMatches(product.content,product.semanticReview))fail('SEMANTIC_REVIEW_REQUIRED','研判须通过独立语义复核');
 const key=dossierKey(product.scope),refs=release.dossierProducts||[];let previous=refs.find(p=>p.key===key),prior=release;while(!previous&&prior.previousReleaseId){prior=await ledger.release(prior.previousReleaseId);previous=prior.dossierProducts?.find(p=>p.key===key);}if(previous&&!product.revisionReason?.trim())fail('REVISION_REASON_REQUIRED','修订必须保留原因');const record={...product,kind:'product',productType:'dossier',inputVersions:input.entries.map(e=>({documentId:e.documentId,bodyVersionId:e.bodyVersionId})),previousProductId:previous?.productId||null,generatedAt:product.generatedAt||new Date().toISOString()};
 const productId='product_'+digest(record),manifest=[...refs.filter(p=>p.key!==key),{key,productId,scope:product.scope}],{releaseId,...rest}=release,next={...rest,dossierProducts:manifest,previousReleaseId:releaseId,publishedAt:new Date().toISOString()};next.releaseId='release_'+digest(next);
 await ledger.repository.commit({expectedReleaseId,head:{releaseId:next.releaseId,snapshotId:next.snapshotId},records:{[productId]:record,[next.releaseId]:next}});return next;
}
export async function readDossier(ledger,release,scope){
 const ref=release.dossierProducts?.find(r=>r.key===dossierKey(scope));if(!ref)return null;
 const current=await ledger.repository.read(ref.productId);if(!current||current.snapshotId!==release.snapshotId)return null;
 const history=[],seen=new Set();let p=current,id=ref.productId;while(p&&!seen.has(id)&&history.length<20){seen.add(id);history.push({productId:id,generatedAt:p.generatedAt,revisionReason:p.revisionReason||null,content:p.content,semanticReview:p.semanticReview});id=p.previousProductId;p=id?await ledger.repository.read(id):null;}
 const phaseComparisons=[];
 for(let n=0;n<history.length-1;n++)for(const after of history[n].content.items.filter(i=>i.kind==='field'&&['项目阶段','运行状态','成熟度'].includes(i.field))){const before=history[n+1].content.items.find(i=>i.kind==='field'&&i.field===after.field);if(before&&before.value!==after.value)phaseComparisons.push({field:after.field,before,after,status:before.effectiveAt&&after.effectiveAt&&before.effectiveAt<after.effectiveAt?'dated_evidence_change':'dates_not_established',beforeProductId:history[n+1].productId,afterProductId:history[n].productId});}
 return {productId:ref.productId,...current,history,phaseComparisons,historyLimited:!!p};
}
