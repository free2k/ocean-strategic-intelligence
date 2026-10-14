// Model selects immutable snippets by short IDs; the application resolves quotations.
// This avoids asking the model to transcribe long version IDs or alter original punctuation.
export function evidenceInput(entries){
 const evidence=new Map(),documents=entries.map(e=>{
  const body=(e.body.contentZh||e.body.content||'').slice(0,6000),snippets=[];
  for(let start=0;start<body.length;start+=600){const quote=body.slice(start,start+600);if(quote.trim().length<8)continue;const id='E'+evidence.size;evidence.set(id,{documentId:e.documentId,bodyVersionId:e.bodyVersionId,quote});snippets.push({id,text:quote});}
  return {title:e.body.titleZh||e.body.title,snippets};
 });return {documents,evidence};
}
export function resolveEvidence(output,evidence){
 if(!Array.isArray(output?.items))throw Error('INVALID_ITEMS');
 return {...output,items:output.items.map(item=>{
  if(!Array.isArray(item.evidenceIds)||!item.evidenceIds.length)throw Error('MISSING_EVIDENCE_IDS');
  const references=[...new Set(item.evidenceIds)].map(id=>{const ref=evidence.get(id);if(!ref)throw Error('UNKNOWN_EVIDENCE_ID');return {...ref};});
  const {evidenceIds,...rest}=item;return {...rest,facts:references.map(r=>r.quote),references};
 })};
}
