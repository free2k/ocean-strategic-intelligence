import {pool} from '../server/integrations/mp2rss-store.mjs';
try{console.log(JSON.stringify((await pool.query("SELECT id,payload->>'name' name,present,checked_at,last_sync,(SELECT count(*) FROM mp2rss.items i WHERE i.subscription_id=s.id) items FROM mp2rss.subscriptions s WHERE payload->>'name' LIKE '%走出去%'")).rows));}finally{await pool.end();}
