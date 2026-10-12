import {pool,status} from '../server/integrations/mp2rss-store.mjs';
try{
 const start=Date.now(),data=await status();
 console.log(JSON.stringify({ms:Date.now()-start,history:data.history,accounts:data.list.filter(s=>s.present&&s.legacy_count).map(s=>({name:s.payload.name,collected:s.count,history:s.legacy_count}))}));
 const audit=(await pool.query(`WITH collected AS MATERIALIZED (SELECT article_id,payload->>'url' AS url FROM mp2rss.items) SELECT count(*)::int AS total FROM articles a JOIN sources s ON s.id=a.source_id WHERE s.type NOT IN ('mp2rss_mp','mp2rss_x') AND NOT EXISTS(SELECT 1 FROM collected i WHERE i.article_id=a.id) AND NOT EXISTS(SELECT 1 FROM collected i WHERE i.url=a.link)`)).rows[0];
 if(audit.total!==data.history.total)throw Error('History totals disagree');
}finally{await pool.end();}
