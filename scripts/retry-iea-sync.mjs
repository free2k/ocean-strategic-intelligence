import {pool,enqueue} from '../server/integrations/mp2rss-store.mjs';
try{
 if(process.argv.includes('--enqueue'))console.log(JSON.stringify(await enqueue('sync','x:84679163')));
 else console.log(JSON.stringify((await pool.query("SELECT id,status,created_at,finished_at,result,error FROM mp2rss.jobs WHERE target='x:84679163' ORDER BY id DESC LIMIT 1")).rows));
}finally{await pool.end();}
