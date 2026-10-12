import {pool,init,refresh} from '../server/integrations/mp2rss-store.mjs';
import {client} from '../server/integrations/mp2rss-client.mjs';
try{await init();console.log(JSON.stringify({accounts:await refresh(client())}));}finally{await pool.end();}
