import {init,pool} from '../../integrations/mp2rss-store.mjs';
export default defineEventHandler(async(event)=>{await init();const q=getQuery(event);const page=Math.max(1,Math.min(100000,Number(q.page)||1));const id=String(q.source||'');
 const result=await pool.query(`SELECT article_id,payload->>'title' title,payload->>'url' url,payload->>'publishedAt' published_at,payload->>'kind' kind,payload->>'contentStatus' content_status,payload->>'author' author,classification->>'status' classification,classification->>'reason' reason FROM mp2rss.items WHERE ($1='' OR subscription_id=$1) ORDER BY payload->>'publishedAt' DESC LIMIT 30 OFFSET $2`,[id,(page-1)*30]);
 const total=(await pool.query("SELECT count(*)::int AS count FROM mp2rss.items WHERE ($1='' OR subscription_id=$1)",[id])).rows[0].count;
 return {items:result.rows,total,page};});
