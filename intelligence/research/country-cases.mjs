import {digest,fail} from './ledger.mjs';
import {validateBrief} from './brief-products.mjs';
import {reviewMatches} from './semantic-review.mjs';

export function validateCountryCase(product,entries){
 const check=validateBrief(product.content,entries,{minItems:1});
 if(!check.ok)fail('INVALID_CASE',check.errors.join(', '));
 const c=product.content;
 if(!c.project||!Array.isArray(c.countries)||c.countries.length<2||c.countries.some(x=>! /^[A-Z]{2}$/.test(x)))fail('INVALID_CASE','明确项目与国家范围');
 for(const item of c.items){
  if(!['role','relation','milestone'].includes(item.kind))fail('INVALID_CASE','未知案例断言类型');
  if(item.kind==='role'&&(!c.countries.includes(item.countryCode)||!item.subject||!item.role))fail('INVALID_CASE','角色缺少主体或国家');
  if(item.kind==='relation'&&(!c.countries.includes(item.countryA)||!c.countries.includes(item.countryB)||item.countryA===item.countryB||!item.subject||!item.relationType||!['signed_conditional','operating'].includes(item.stage)))fail('INVALID_CASE','关系范围或阶段不明确');
  if(item.kind==='milestone'&&(!item.timeLabel||!['actual','planned','reported_state'].includes(item.stage)))fail('INVALID_CASE','时间性质不明确');
 }
 if(!reviewMatches(c,product.semanticReview))fail('SEMANTIC_REVIEW_REQUIRED','案例所有断言须通过独立复核');
}
export async function publishCountryCase(ledger,product,expectedReleaseId){
 const release=await ledger.resolveRelease({releaseId:expectedReleaseId});
 if(product.snapshotId!==release.snapshotId)fail('VERSION_CONFLICT','案例输入快照变化');
 const snapshot=await ledger.snapshot(release.snapshotId);validateCountryCase(product,snapshot.entries);
 const record={...product,kind:'product',productType:'country_case',generatedAt:new Date().toISOString()},productId='product_'+digest(record);
 const {releaseId,...rest}=release,next={...rest,countryCases:[...(release.countryCases||[]).filter(x=>x.project!==product.content.project),{project:product.content.project,productId}],previousReleaseId:releaseId,publishedAt:new Date().toISOString()};next.releaseId='release_'+digest(next);
 await ledger.repository.commit({expectedReleaseId,head:{releaseId:next.releaseId,snapshotId:next.snapshotId},records:{[productId]:record,[next.releaseId]:next}});return next;
}

// A complete case is shown only when all its cited documents remain in scope.
export function caseInScope(product,{selected,documents,topic,entries,mode}){
 const c=product.content;
 if(selected.size&&(mode==='within'?c.countries.filter(code=>selected.has(code)).length<2:!c.countries.some(code=>selected.has(code))))return false;
 return c.items.every(i=>i.references.every(ref=>documents.has(ref.documentId)&&(!topic||entries.find(e=>e.documentId===ref.documentId)?.classification?.primary===topic)));
}
