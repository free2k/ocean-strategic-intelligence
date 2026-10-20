// The ledger records body, classification and extracted facts. Binary evidence
// assets, embeddings and ingestion checkpoints remain in the source workspace.
// Do not keep them alive while building several generations of registries.
export function publicationInput(data){
 const fields=['id','versionId','title','titleZh','content','contentZh','url','sourceId','publishedAt','uploadId','industry'];
 return {
  ...Object.fromEntries(['sources','entities','events','relations','observations','evidence','generatedAt','industryRuleVersion','industryRulePublication','industryRuleConfig','errors'].map(k=>[k,data[k]])),
  documents:data.documents.map(d=>Object.fromEntries(fields.map(k=>[k,d[k]])))
 };
}
