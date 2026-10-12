import assert from 'node:assert/strict';
import {pool,enqueue} from '../server/integrations/mp2rss-store.mjs';
const before=(await pool.query("SELECT payload FROM mp2rss.state WHERE id='sync'")).rows[0].payload;
const job=await enqueue('sync','mp:3867577799');console.log(JSON.stringify({job:job.id,status:'queued'}));
try{let done=false;for(let n=0;n<100;n++){const row=(await pool.query('SELECT status FROM mp2rss.jobs WHERE id=$1',[job.id])).rows[0];if(['completed','partial','failed'].includes(row.status)){assert.equal(row.status,'completed');done=true;break;}await new Promise(r=>setTimeout(r,1000));}assert.ok(done,'Task did not complete within test window');const after=(await pool.query("SELECT payload FROM mp2rss.state WHERE id='sync'")).rows[0].payload;assert.equal(after.nextRunAt,before.nextRunAt);console.log('Targeted sync completed without shifting full collection schedule');}finally{await pool.end();}
