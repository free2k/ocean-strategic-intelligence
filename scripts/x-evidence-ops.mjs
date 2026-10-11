import {pool,enqueue} from '../server/integrations/mp2rss-store.mjs';
import {initEvidence,processXEvidence,queueLink} from '../server/integrations/x-evidence-store.mjs';
try{
 await initEvidence();
 if(process.argv.includes('--enable-samples')){await pool.query("UPDATE mp2rss.subscriptions SET posts=true WHERE id IN ('x:316383161','x:22032260')");await enqueue('sync');}
 if(process.argv.includes('--process'))console.log(JSON.stringify(await processXEvidence()));
 if(process.argv.includes('--verify-dedupe')){const row=(await pool.query('SELECT * FROM mp2rss.evidence_links LIMIT 1')).rows[0];if(row){await queueLink(row.url,row.kind,row.origins[0]);await queueLink(row.url,row.kind,row.origins[0]);const check=(await pool.query('SELECT origins FROM mp2rss.evidence_links WHERE url=$1',[row.url])).rows[0];if(check.origins.length!==row.origins.length)throw Error('origin_dedupe_failed');console.log('Origin replay deduplication passed');}}
 console.log(JSON.stringify({translationCache:(await pool.query("SELECT count(*)::int n FROM mp2rss.state WHERE id LIKE 'x-translation:%'")).rows[0].n,posts:(await pool.query("SELECT classification->>'status' status,classification->>'primary' topic,count(*)::int n FROM mp2rss.items WHERE payload->>'kind'='x_post' GROUP BY 1,2")).rows,state:(await pool.query("SELECT payload FROM mp2rss.state WHERE id='x-evidence'")).rows[0]?.payload}));
 console.log(JSON.stringify({accounts:(await pool.query("SELECT id,payload->>'name' name,posts,enabled FROM mp2rss.subscriptions WHERE payload->>'platform'='x'")).rows,links:(await pool.query('SELECT kind,status,count(*)::int n FROM mp2rss.evidence_links GROUP BY kind,status')).rows,documents:(await pool.query("SELECT payload->>'title' title,payload->>'status' status,classification->>'status' classification,classification->>'primary' topic FROM mp2rss.evidence_documents")).rows}));
}finally{await pool.end();}
