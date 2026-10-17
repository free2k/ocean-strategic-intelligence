// Resolve persisted decisions, never infer freshness from a rule-version hash.
export function resolveClassificationResult(article, collected) {
 const candidates=[article,collected].filter(x=>x?.classification);
 const manual=candidates.find(x=>x.classification.manual||x.classification.method==='manual');
 if(manual)return manual.classification;
 if(candidates.length<2)return candidates[0]?.classification;
 const time=x=>Date.parse(x.updatedAt)||0;
 // Canonical article result wins a transaction-time tie. Legacy rows without
 // timestamps retain the existing collection preference until reconciled.
 if(time(article)&&time(article)>=time(collected))return article.classification;
 return collected.classification;
}
