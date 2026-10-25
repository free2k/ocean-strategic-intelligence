import fs from 'node:fs/promises';
import path from 'node:path';
import {pool,persistItem} from '../server/integrations/mp2rss-store.mjs';
import {client,items} from '../server/integrations/mp2rss-client.mjs';
import {compileRules} from '../intelligence/industry-classification.mjs';

// Read-only unless --apply is specified. Never replaces an existing body.
const apply=process.argv.includes('--apply');
const dir=process.env.SOURCE_MAINTENANCE_DIR||'.data/source-maintenance';
const api=client();let guard,job;
try{
 await fs.mkdir(dir,{recursive:true,mode:0o700});
 const sources=(await pool.query(`SELECT s.* FROM mp2rss.subscriptions s WHERE present AND NOT EXISTS(SELECT 1 FROM mp2rss.items i WHERE i.subscription_id=s.id) ORDER BY s.id`)).rows;
 const prepared=[];
 for(const source of sources){
  const kinds=source.payload.platform==='mp'?['articles']:[...(source.posts?['posts']:[]),'articles'];
  const records=[];
  for(const kind of kinds)for await(const item of items(api,source.payload,kind,{since:null}))records.push(item);
  const bodies=records.filter(i=>i.contentStatus==='complete').length;
  prepared.push({source,records});
  console.log(JSON.stringify({id:source.id,name:source.payload.name,available:records.length,bodies,latest:records.map(r=>r.publishedAt).sort().at(-1)||null}));
  if(!bodies)throw Error('账号仍无有效正文，需人工评估替代：'+source.id);
 }
 await fs.writeFile(path.join(dir,'empty-subscriptions-before.json'),JSON.stringify(prepared),{mode:0o600});
 if(apply&&prepared.length){
  guard=await pool.connect();if(!(await guard.query('SELECT pg_try_advisory_lock(73201910) held')).rows[0].held)throw Error('订阅同步正在运行，未进行补采');
  const compiled=compileRules({rules:(await pool.query('SELECT * FROM public.filter_rules')).rows});
  job=(await pool.query("INSERT INTO mp2rss.jobs(action,request,status,started_at) VALUES('batch_sync',$1,'running',now()) RETURNING id",[JSON.stringify(prepared.map(p=>p.source.id))])).rows[0].id;
  const result={inserted:0,updated:0,duplicate:0,failed:0,streams:[],reason:'补齐首次三日窗口遗漏的供应商现有历史正文'};
  for(const {source,records} of prepared){
   if((await pool.query('SELECT 1 FROM mp2rss.items WHERE subscription_id=$1 LIMIT 1',[source.id])).rowCount)continue;
   const report={source:source.id,kind:'provider-history',inserted:0,updated:0,duplicate:0,failed:0};
   for(const item of records){const outcome=await persistItem(source,item,compiled);report[outcome]++;result[outcome]++;}
   await pool.query("UPDATE mp2rss.subscriptions SET last_sync=now(),status='completed',error=NULL WHERE id=$1",[source.id]);
   result.streams.push(report);
  }
  await pool.query("UPDATE mp2rss.jobs SET status='completed',finished_at=now(),result=$2 WHERE id=$1",[job,result]);
  console.log(JSON.stringify({job,...result}));
 }
}catch(error){if(job)await pool.query("UPDATE mp2rss.jobs SET status='partial',finished_at=now(),error=$2 WHERE id=$1",[job,error.message]);throw error;}
finally{if(guard){await guard.query('SELECT pg_advisory_unlock(73201910)');guard.release();}await pool.end();}
