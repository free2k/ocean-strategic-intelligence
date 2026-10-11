import {init,pool} from '../../integrations/mp2rss-store.mjs';
export default defineEventHandler(async(event)=>{
 await init();if(!(await pool.query("SELECT to_regclass('mp2rss.evidence_links') t")).rows[0].t)return {counts:[],items:[],documents:[],state:{}};
 const counts=(await pool.query('SELECT status,kind,count(*)::int count FROM mp2rss.evidence_links GROUP BY status,kind')).rows;
 const q=getQuery(event),page=Math.max(1,Number(q.page)||1);
 const items=(await pool.query("SELECT url,kind,status,updated_at,payload->>'error' error,payload->>'title' title,payload->>'summaryZh' summary_zh FROM mp2rss.evidence_links ORDER BY updated_at DESC LIMIT 30 OFFSET $1",[(page-1)*30])).rows;
 const documents=(await pool.query("SELECT url,payload->>'title' title,payload->>'titleZh' title_zh,payload->>'publishedAt' published_at,payload->>'status' status,classification FROM mp2rss.evidence_documents ORDER BY updated_at DESC LIMIT 30 OFFSET $1",[(page-1)*30])).rows;
 const state=(await pool.query("SELECT payload FROM mp2rss.state WHERE id='x-evidence'")).rows[0]?.payload||{};
 const oilprice=(await pool.query("SELECT payload FROM mp2rss.state WHERE id='oilprice-sync'")).rows[0]?.payload||null;
 return {counts,items,documents,state,page,oilprice};
});
