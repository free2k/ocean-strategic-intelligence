// Resolve persisted decisions, never infer freshness from a rule-version hash.
export function resolveClassificationResult(article, collected) {
 const candidates=[article,collected].filter(x=>x?.classification);
 const manual=candidates.find(x=>x.classification.manual||x.classification.method==='manual');
 if(manual)return manual.classification;
 if(candidates.length<2)return candidates[0]?.classification;
 const time=x=>Date.parse(x.updatedAt)||0;
 // A timestamp tie cannot establish freshness across different rule versions.
 // Keep the collection result for that legacy ambiguity; synchronized writes
 // have the same rule version and can use the canonical article result.
 if(time(article)&&(time(article)>time(collected)||(time(article)===time(collected)&&article.classification.version===collected.classification.version)))return article.classification;
 return collected.classification;
}
