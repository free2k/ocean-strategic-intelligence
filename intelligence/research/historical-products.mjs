import {digest,fail} from './ledger.mjs';import {validateBrief} from './brief-products.mjs';import {reviewMatches} from './semantic-review.mjs';
export async function publishHistoricalBatch(ledger,product){
 if(!['ready','failed','deferred'].includes(product.status)||!product.inputKey||!Array.isArray(product.inputDocumentIds)||!product.inputDocumentIds.length)fail('INVALID_PRODUCT','回填批次缺少明确状态或输入资料');
 const release=await ledger.latest();if(product.snapshotId!==release.snapshotId)fail('VERSION_CONFLICT','回填快照已变化');const snapshot=await ledger.snapshot(release.snapshotId),ids=new Set(product.inputDocumentIds),entries=snapshot.entries.filter(e=>ids.has(e.documentId));
 if(entries.length!==ids.size)fail('INVALID_INPUT','输入资料不属于快照');
 if(product.status==='ready'){const check=validateBrief(product.content,entries,{minItems:1});if(!check.ok)fail('INVALID_PRODUCT',check.errors.join(','));if(!reviewMatches(product.content,product.semanticReview))fail('SEMANTIC_REVIEW_REQUIRED','独立复核未通过');}
 else if(product.content||!product.reason)fail('INVALID_PRODUCT','未完成结果不能携带结论');
 const record={...product,kind:'product',productType:'historical_batch'},id='product_'+digest(record),{releaseId,...rest}=release,next={...rest,historicalProducts:[...(release.historicalProducts||[]).filter(x=>x.inputKey!==product.inputKey),{inputKey:product.inputKey,productId:id}],previousReleaseId:releaseId,publishedAt:new Date().toISOString()};next.releaseId='release_'+digest(next);await ledger.repository.commit({expectedReleaseId:releaseId,head:{releaseId:next.releaseId,snapshotId:next.snapshotId},records:{[id]:record,[next.releaseId]:next}});return next;
}
export async function readHistoricalBatches(ledger,query={}){
 if(Object.keys(query).some(k=>!['releaseId','snapshotId','topic'].includes(k)))fail('INVALID_SCOPE','回填成果仅支持版本与领域筛选');const release=await ledger.resolveRelease(query),rows=(await Promise.all((release.historicalProducts||[]).map(r=>ledger.repository.read(r.productId)))).filter(p=>p.snapshotId===release.snapshotId&&(!query.topic||query.topic===p.topic));
 const snapshot=await ledger.snapshot(release.snapshotId),scopeEntries=snapshot.entries.filter(e=>!query.topic||e.classification?.primary===query.topic),accepted=scopeEntries.filter(e=>e.classification?.status==='accepted');
 return {data:rows,meta:{releaseId:release.releaseId,ready:rows.filter(p=>p.status==='ready').length,failed:rows.filter(p=>p.status!=='ready').length,inputDocuments:new Set(rows.flatMap(p=>p.inputDocumentIds)).size,snapshotDocuments:scopeEntries.length,acceptedDocuments:accepted.length,bodyReadyDocuments:accepted.filter(e=>(e.body.contentZh||e.body.content||'').trim().length>=80).length,scope:'当前工作资料快照；片段批次成果，不等于全库研判完成'}};
}
