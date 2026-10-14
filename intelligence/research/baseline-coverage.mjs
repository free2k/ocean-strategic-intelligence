import {createHash} from 'node:crypto';
export const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function articleIndex(row,original=null){
 const text=String(row.content||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|#160);/gi,' ').replace(/\s+/g,' ').trim();
 // A length check is a readiness gate, never a claim that the body is accurate or complete.
 const bodyState=!text?'missing':text.length<200?'short':'available_unverified';
 const blocked=row.filter_status==='rejected',manual=Boolean(row.manual_classify)||row.classify_method==='manual';
 return {sourceKey:'public.articles:'+row.id,originalId:row.id,title:row.title,url:row.link,sourceId:row.source_id,sourceType:row.source_type,publishedAt:row.published_at,updatedAt:row.updated_at,timestampBasis:'source_timestamp_without_timezone',sourceRowHash:original?.rowSha256||hash(row),bodyHash:original?.bodySha256||hash(row.content||''),bodyBytes:original?.bodyBytes??Buffer.byteLength(row.content||''),derivedTextHash:hash(row.content||''),bodyProjection:original?.transform||'original',originalBodyStorage:original?.bodyStorage||'capture',bodyTextCharacters:text.length,bodyState,classification:row.filter_status,matchedTopic:row.matched_topic,manualClassified:manual,matchedKeywords:row.matched_keywords_json,rejectReason:row.reject_reason,analysisStatus:'not_analyzed',nextAction:blocked?'preserve_exclusion':bodyState==='missing'?'body_required':bodyState==='short'?'body_review':manual?'preserve_manual_review':row.filter_status!=='accepted'?'classification_review':'ready_for_isolated_analysis',structuredMatches:[]};
}
export function mapCoverage(articles,documents){
 const byUrl=new Map();for(const d of documents){if(!d.url)continue;const rows=byUrl.get(d.url)||[];rows.push(d);byUrl.set(d.url,rows);}
 for(const a of articles){a.structuredMatches=(byUrl.get(a.url)||[]).map(d=>({documentId:d.id,sourceRowHash:d.sourceRowHash,bodyHash:d.bodyHash}));a.mappingStatus=a.structuredMatches.length===1?'exact_url_candidate':a.structuredMatches.length?'ambiguous_url':'unmapped';}
 const tally=key=>Object.fromEntries([...new Set(articles.map(a=>a[key]))].map(k=>[k,articles.filter(a=>a[key]===k).length]));
 return {originalArticles:articles.length,structuredDocuments:documents.length,bodyStates:tally('bodyState'),classificationStates:tally('classification'),nextActions:tally('nextAction'),mappingStates:tally('mappingStatus'),manualClassified:articles.filter(a=>a.manualClassified).length,analysis:{completed:0,pending:articles.length},mappingPolicy:'Exact URL candidates only; separate records and original IDs retained. No automatic merging or classification overwrite.'};
}
