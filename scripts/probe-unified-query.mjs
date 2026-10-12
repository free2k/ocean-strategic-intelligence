import {pool} from '../server/integrations/mp2rss-store.mjs';
try{console.log(JSON.stringify((await pool.query("SELECT state,wait_event_type,wait_event,extract(epoch from now()-query_start)::int seconds,left(query,200) query FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND state='active' AND query LIKE '%collected AS MATERIALIZED%'")).rows));}finally{await pool.end();}
