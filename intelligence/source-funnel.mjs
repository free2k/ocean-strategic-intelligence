import {cachedAudit,summarizeAudit,auditBridge} from './classification-audit.mjs';
export async function sourceFunnels(pool){
 if(!pool)return {};
 const audit=await cachedAudit(pool),result={};
 for(const s of audit.subscriptions){const id='mp2rss_'+s.id,rows=audit.documents.filter(d=>d.sourceIds.includes(id)),c=summarizeAudit(rows),b=auditBridge(rows);result[id]={id,collected:c.total,included:c.accepted,excluded:c.excluded,pending:c.pending,bridge:b,observedAt:audit.observedAt};}
 return result;
}
