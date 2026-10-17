import {init,refresh,pool} from '../server/integrations/mp2rss-store.mjs';
import {client} from '../server/integrations/mp2rss-client.mjs';
import {enqueueBatch} from '../server/integrations/mp2rss-batch.mjs';
try{
 await init();const total=await refresh(client());
 const rows=(await pool.query("SELECT id,payload FROM mp2rss.subscriptions WHERE present AND payload->'accountLabels' @> '[2]'::jsonb")).rows;
 const ids=rows.map(s=>s.id);
 await pool.query("UPDATE mp2rss.subscriptions SET posts=true WHERE id=ANY($1::text[]) AND payload->>'platform'='x'",[ids]);
 const job=ids.length?await enqueueBatch(pool,'batch_sync',ids):null;
 console.log(JSON.stringify({uniqueChannels:total,secondAccount:ids.length,job}));
}finally{await pool.end();}
