import {digest,fail} from './ledger.mjs';
import {standardTopics,canonicalTopic} from '../industry-topics.mjs';
import {reviewMatches} from './semantic-review.mjs';
export const briefConfigVersion='brief-evidence-v3';
const text=(v,max=3000)=>typeof v==='string'&&v.trim()&&v.length<=max;
const numbers=s=>String(s).match(/\d+(?:[,.]\d+)*(?:%|％)?/g)||[];
export function briefInputs(snapshot,batch,topic,collection='batch_affected_domain'){
 const changed=new Set(batch.changes.map(c=>c.documentId));
 return snapshot.entries.filter(e=>(collection==='snapshot_domain_backfill'||changed.has(e.documentId))&&e.classification?.status==='accepted'&&canonicalTopic(e.classification.primary)===topic);
}
export function briefInputKey({snapshotId,batchId,topic,entries,configVersion}){return digest({snapshotId,batchId,topic,versions:entries.map(e=>[e.documentId,e.bodyVersionId,e.classificationVersionId,e.structureVersionId]).sort(),configVersion});}
// Exact quotations and version-bound references are mandatory. Analytical prose is labelled
// as analysis, never promoted to independently verified facts by successful JSON validation.
export function validateBrief(output,entries,{minItems=2}={}){
 const errors=[],byId=new Map(entries.map(e=>[e.documentId,e]));
 if(!output||!text(output.overview)||!text(output.watch)||!Array.isArray(output.items)||output.items.length<minItems||output.items.length>12)return {ok:false,errors:['INVALID_BRIEF_STRUCTURE']};
 const ids=new Set(),seenFacts=new Set();
 for(const item of output.items){
  if(!text(item?.id,120)||ids.has(item.id)||!text(item.title,160)||!text(item.analysis)||!text(item.gaps)||!text(item.watch)||!Array.isArray(item.facts)||!item.facts.length||!Array.isArray(item.references)||!item.references.length){errors.push('INVALID_ITEM_STRUCTURE');continue;}ids.add(item.id);
  const quotes=[];
  for(const ref of item.references){const entry=byId.get(ref?.documentId);if(!entry||ref.bodyVersionId!==entry.bodyVersionId||!text(ref.quote,1200)||ref.quote.length<8||![entry.body.content,entry.body.contentZh,entry.body.title,entry.body.titleZh].filter(Boolean).some(body=>body.includes(ref.quote))){errors.push('EVIDENCE_NOT_IN_PINNED_INPUT');continue;}quotes.push(ref.quote);}
  for(const fact of item.facts){if(!text(fact,1200)||!quotes.some(q=>q.includes(fact)))errors.push('FACT_NOT_EXACTLY_SUPPORTED');if(seenFacts.has(fact))errors.push('DUPLICATE_FACT');seenFacts.add(fact);}
  const supported=new Set(quotes.flatMap(numbers));for(const num of numbers([item.title,item.analysis,item.gaps,item.watch].join(' ')))if(!supported.has(num))errors.push('UNSUPPORTED_NUMBER');
 }
 const allNumbers=new Set(output.items.flatMap(i=>(Array.isArray(i?.references)?i.references:[]).flatMap(r=>numbers(r?.quote))));for(const n of numbers(output.overview+' '+output.watch))if(!allNumbers.has(n))errors.push('UNSUPPORTED_SUMMARY_NUMBER');
 return {ok:errors.length===0,errors:[...new Set(errors)]};
}
export async function publishBriefProducts(ledger,products,expectedReleaseId){
 const release=await ledger.resolveRelease({releaseId:expectedReleaseId}),snapshot=await ledger.snapshot(release.snapshotId),batch=await ledger.batch(release.batchId),records={},next=new Map((release.products||[]).map(p=>[p.topic,p]));
 for(const product of products){
  if(!standardTopics.some(t=>t.id===product.topic)||product.snapshotId!==release.snapshotId||product.batchId!==release.batchId||!['ready','insufficient','deferred','failed'].includes(product.status)||!['batch_affected_domain','snapshot_domain_backfill'].includes(product.scope?.collection)||Object.keys(product.scope).length!==1)fail('INVALID_PRODUCT_SCOPE','成果与本次发布范围不一致');
  const entries=briefInputs(snapshot,batch,product.topic,product.scope.collection);
  if(product.inputKey!==briefInputKey({...product,entries}))fail('INVALID_PRODUCT_INPUT','成果输入版本不一致');
  if(product.status==='ready'){if(batch.baseline&&product.scope.collection!=='snapshot_domain_backfill')fail('BASELINE_NOT_ANALYZED','迁移基线不能冒充增量研究成果');const validation=validateBrief(product.content,entries);if(!validation.ok)fail('PRODUCT_VALIDATION_FAILED',validation.errors.join(', '));if(!reviewMatches(product.content,product.semanticReview))fail('SEMANTIC_REVIEW_REQUIRED','成果须通过绑定当前正文的语义与事件去重复核');}
  else if(!product.reason||product.content)fail('INVALID_PRODUCT_STATUS','未就绪成果必须提供原因，不能附上结论正文');
  if(next.get(product.topic)?.status==='ready'&&product.status!=='ready')continue;
  const value={...product,kind:'product'},id='product_'+digest(value);records[id]=value;next.set(product.topic,{topic:product.topic,productId:id,status:product.status,scope:product.scope});
 }
 const manifest=[...next.values()].sort((a,b)=>a.topic.localeCompare(b.topic));
 if(digest(manifest)===digest(release.products||[]))return {...release,unchanged:true};
 const statuses=manifest.map(p=>p.status),productStatus=manifest.length===6&&statuses.every(s=>['ready','insufficient'].includes(s))?'ready':statuses.includes('ready')?'partial':'deferred';
 const {releaseId:oldId,...old}=release,newRelease={...old,previousReleaseId:oldId,publishedAt:new Date().toISOString(),products:manifest,productStatus,productReason:productStatus==='ready'?null:'SOME_PRODUCTS_NOT_READY'};
 newRelease.releaseId='release_'+digest(newRelease);records[newRelease.releaseId]=newRelease;
 await ledger.repository.commit({expectedReleaseId,head:{releaseId:newRelease.releaseId,snapshotId:newRelease.snapshotId},records});return newRelease;
}
export async function readBriefs(ledger,{releaseId,snapshotId,topic,...unsupported}={}){
 if(Object.keys(unsupported).some(k=>unsupported[k]))fail('PRODUCT_SCOPE_UNAVAILABLE','尚无此组合筛选范围的已保存简报，不能用其他范围的结论替代');
 if(topic&&!standardTopics.some(t=>t.id===canonicalTopic(topic)))fail('INVALID_SCOPE','未知研究领域');
 const release=await ledger.resolveRelease({releaseId,snapshotId}),selected=standardTopics.filter(t=>!topic||t.id===canonicalTopic(topic)),data=[];
 for(const t of selected){const ref=release.products?.find(p=>p.topic===t.id);if(!ref){data.push({topic:t.id,name:t.name,status:'deferred',reason:'BRIEF_NOT_SCHEDULED'});continue;}const product=await ledger.repository.read(ref.productId);if(!product||product.kind!=='product')fail('PRODUCT_NOT_FOUND','发布清单中的成果不存在',404);data.push({...product,productId:ref.productId,name:t.name});}
 const collections=[...new Set(data.map(p=>p.scope?.collection).filter(Boolean))];
 return {data,meta:{releaseId:release.releaseId,snapshotId:release.snapshotId,batchId:release.batchId,scope:{collection:collections.length===1?collections[0]:collections.length?'mixed':'not_available'},generatedAt:release.publishedAt}};
}
