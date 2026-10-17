import {pool} from '../server/integrations/mp2rss-store.mjs';
try{
console.log(JSON.stringify({jobs:(await pool.query("SELECT id,action,status,created_at,started_at,finished_at,result,error FROM mp2rss.jobs WHERE id=291 OR status IN ('queued','running') ORDER BY id")).rows,subscriptions:(await pool.query("SELECT payload->>'platform' platform,count(*)::int count FROM mp2rss.subscriptions WHERE present GROUP BY 1")).rows,requested:(await pool.query("SELECT payload->>'name' name,payload->>'handle' handle,posts FROM mp2rss.subscriptions WHERE present AND lower(payload->>'handle')=ANY($1::text[])",[['ogcinews','jogmec_jp','oxfordenergy','bimconews','marineinsight','seatrade','carboncapturemg','apienergy']])).rows}));
}finally{await pool.end();}
