import {enqueue,pool} from '../server/integrations/mp2rss-store.mjs';
try{console.log(JSON.stringify(await enqueue('sync')));}finally{await pool.end();}
