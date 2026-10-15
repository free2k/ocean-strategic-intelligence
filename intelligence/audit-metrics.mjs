import {auditState} from './classification-audit.mjs';
import {standardTopics,canonicalTopic} from './industry-topics.mjs';
export function auditMetrics(audit){
 const accepted=audit.documents.filter(d=>auditState(d.classification)==='accepted');
 const categories={};
 for(const region of ['domestic','overseas','unknown']){const rows=accepted.filter(d=>(d.region||'unknown')===region);categories[region]=[...standardTopics.map(t=>({name:t.name,count:rows.filter(d=>canonicalTopic(d.classification?.primary)===t.id).length})),{name:'未记录主领域',count:rows.filter(d=>!standardTopics.some(t=>t.id===canonicalTopic(d.classification?.primary))).length}].filter(t=>t.count);}
 return {observedAt:audit.observedAt,metricVersion:audit.metricVersion,scope:audit.scope,classification:audit.counts,totalArticles:audit.counts.total,vectorizedArticles:audit.processing?.vectorized,totalSources:audit.processing?.registered_sources,totalChunks:audit.processing?.chunks,missingContentArticles:audit.processing?.missing_content,processingScope:'public.articles',categories,coverage:audit.coverage};
}
