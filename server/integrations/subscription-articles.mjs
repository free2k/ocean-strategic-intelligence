import {historyAccount} from './subscription-history.mjs';
import {bodyReason} from './body-reason.mjs';

export async function subscriptionArticles(pool,{source,page=1,origin='all',missing=false}){
 const db=await pool.connect();
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const subscriptions=(await db.query('SELECT id,source_id,payload FROM mp2rss.subscriptions')).rows;
  if(!subscriptions.some(s=>s.id===source)){await db.query('COMMIT');return null;}
  const sources=(await db.query("SELECT id,name,type,fakeid FROM public.sources WHERE type NOT IN ('mp2rss_mp','mp2rss_x')")).rows;
  const legacyIds=sources.filter(s=>historyAccount(subscriptions,s)?.id===source).map(s=>s.id);
  // Same ID/URL exclusion and account matching as the subscription table's history counts.
  const cte=`WITH collected AS MATERIALIZED (SELECT i.article_id,coalesce(a.link,i.payload->>'url') url FROM mp2rss.items i LEFT JOIN public.articles a ON a.id=i.article_id), entries AS (
   SELECT i.id item_id,i.article_id,'mp2rss'::text origin,(i.payload->>'publishedAt')::timestamptz published_at,coalesce(i.payload->>'contentStatus'='complete',false) ready
   FROM mp2rss.items i WHERE i.subscription_id=$1
   UNION ALL
   SELECT 'legacy:'||a.id,a.id,'legacy',a.published_at::timestamptz,
    coalesce(octet_length(a.content),0)>0
   FROM public.articles a WHERE a.source_id=ANY($2::int[])
    AND NOT EXISTS(SELECT 1 FROM collected c WHERE c.article_id=a.id)
    AND NOT EXISTS(SELECT 1 FROM collected c WHERE c.url=a.link)
  )`;
  const filter="($3='all' OR origin=$3) AND (NOT $4::boolean OR NOT ready)";
  const counts=(await db.query(`${cte} SELECT count(*)::int all_count,count(*) FILTER(WHERE origin='mp2rss')::int mp2rss,count(*) FILTER(WHERE origin='legacy')::int legacy,count(*) FILTER(WHERE ready)::int ready,count(*) FILTER(WHERE NOT ready)::int missing,count(*) FILTER(WHERE ${filter})::int filtered FROM entries`,[source,legacyIds,origin,missing])).rows[0];
  const rows=(await db.query(`${cte} SELECT e.*,i.payload,i.classification,a.title,a.link,a.author_name,a.classify_method,a.filter_status,a.matched_topic,a.reject_reason,a.download_status
   FROM (SELECT * FROM entries WHERE ${filter} ORDER BY published_at DESC NULLS LAST,item_id LIMIT 30 OFFSET $5) e
   LEFT JOIN mp2rss.items i ON i.id=e.item_id AND e.origin='mp2rss'
   LEFT JOIN public.articles a ON a.id=e.article_id
   ORDER BY e.published_at DESC NULLS LAST,e.item_id`,[source,legacyIds,origin,missing,(page-1)*30])).rows;
  await db.query('COMMIT');
  const items=rows.map(r=>{
   const legacy=r.origin==='legacy',p=r.payload||{};
   return {item_id:r.item_id,article_id:r.article_id,origin:r.origin,title:p.title||r.title,url:p.url||r.link,published_at:r.published_at,kind:p.kind||(source.startsWith('mp:')?'mp_article':'article'),content_status:legacy?(r.ready?'complete':'pending_body'):p.contentStatus,body_origin:p.bodyOrigin,author:p.author||r.author_name,
    body_reason:legacy?(!r.ready?{code:'legacy_missing',label:'历史记录缺少正文',detail:'旧采集渠道留下了文章记录，但没有可用的文字正文；未记录足够信息判断具体缺失原因。'}:null):bodyReason(p),
    classification:legacy?({accepted:'accepted',rejected:'excluded',pending:'unmatched'}[r.filter_status]||'unmatched'):r.classification?.status,
    reason:legacy?r.reject_reason:r.classification?.reason,classification_details:legacy?null:r.classification,classification_method:legacy?r.classify_method:(r.classification?.method||'keyword'),article_method:r.classify_method,article_status:r.filter_status,article_topic:r.matched_topic,article_reason:r.reject_reason};
  });
  return {items,total:counts.filtered,page,counts};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
