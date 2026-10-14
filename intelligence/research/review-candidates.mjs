import {validateBrief} from './brief-products.mjs';
// A failed draft remains failed. Keep an explicitly partial review candidate separately;
// discard its model overview because it may depend on rejected items.
export function reviewCandidate(content,entries){
 const overview='以下条目来自本次历史样本，未通过引用校验的条目未纳入。仅供进一步审核，不代表完整领域简报。',watch='逐项核对分析与原文之间的关系，继续补充证据缺口。';
 const items=[],omitted=[];
 for(const item of content?.items||[]){const candidate={overview,watch,items:[...items,item]},check=validateBrief(candidate,entries,{minItems:1});if(check.ok)items.push(item);else omitted.push({id:item.id,errors:check.errors});}
 const candidate={overview,watch,items},validation=validateBrief(candidate,entries);
 return {status:validation.ok?'reviewable_partial':'insufficient_validated_items',content:candidate,omitted,validation,semanticReview:'required',published:false};
}
