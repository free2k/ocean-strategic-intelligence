const key=value=>String(value||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
export function historyAccount(list,source){
 const decoded=Buffer.from(String(source.fakeid||''),'base64').toString('utf8');
 const identity=/^\d+$/.test(decoded)?decoded:null;
 const matches=list.filter(s=>s.source_id===source.id||(source.type==='wechat'&&s.payload.platform==='mp'&&(identity?String(s.payload.remoteId)===identity:key(s.payload.name)===key(source.name))));
 return matches.length===1?matches[0]:null;
}
export function attachHistory(list,sources){
 for(const s of list)s.legacy_count=0;
 let unmatched=0,total=0;
 for(const source of sources){
  const count=Number(source.count);total+=count;
  const account=historyAccount(list,source);
  if(account)account.legacy_count+=count;else unmatched+=count;
 }
 return {total,unmatched,subscribed:list.filter(s=>s.present).reduce((n,s)=>n+s.legacy_count,0)};
}
export async function subscriptionHistory(pool,list){
 // Exclude both linked records and identical original URLs already collected by Mp2RSS.
 const sources=(await pool.query(`WITH collected AS MATERIALIZED (SELECT i.article_id,coalesce(a.link,i.payload->>'url') AS url FROM mp2rss.items i LEFT JOIN public.articles a ON a.id=i.article_id)
 SELECT s.id,s.name,s.fakeid,s.type,count(*)::int AS count
 FROM public.articles a JOIN public.sources s ON s.id=a.source_id
 WHERE s.type NOT IN ('mp2rss_mp','mp2rss_x')
 AND NOT EXISTS(SELECT 1 FROM collected i WHERE i.article_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM collected i WHERE i.url=a.link)
 GROUP BY s.id,s.name,s.fakeid,s.type`)).rows;
 return attachHistory(list,sources);
}
