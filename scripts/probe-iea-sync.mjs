import {pool,persistItem} from '../server/integrations/mp2rss-store.mjs';
import {compileRules} from '../intelligence/industry-classification.mjs';
import {client,normalize} from '../server/integrations/mp2rss-client.mjs';
try {
 const ss=(await pool.query("SELECT id,source_id,payload,posts,last_sync FROM mp2rss.subscriptions WHERE payload->>'name' ILIKE '%International Energy Agency%'")).rows;
 console.log(JSON.stringify({subscriptions:ss}));
 const jobs=(await pool.query('SELECT id,status,result FROM mp2rss.jobs WHERE id=ANY($1::bigint[])',[[93,96]])).rows;
 console.log(JSON.stringify({jobs:jobs.map(j=>({...j,result:{...j.result,streams:j.result?.streams?.filter(r=>ss.some(s=>s.id===r.source))}}))}));
 const api=client();const compiled=compileRules({rules:(await pool.query('SELECT * FROM public.filter_rules')).rows});
 for(const s of ss)for(const kind of [...(s.posts?['posts']:[]),'articles']){
  const src=s.payload;let count=0;
  for(let page=1;page<=20;page++){
   const r=await api(`/open-api/x/${src.remoteId}/${kind}?page=${page}&pageSize=50`);
   for(const raw of r.items||[]){try{const item=normalize(src,kind,raw);if(process.argv.includes('--retry'))await persistItem(s,item,compiled);count++;}catch(e){console.log(JSON.stringify({kind,page,error:e.message,code:e.code,detail:e.detail,where:e.where,stack:e.stack,constraint:e.constraint,postedAt:raw.postedAt,publishedAt:raw.publishedAt,updatedAt:raw.updatedAt,url:raw.url,postId:raw.postId}));if(process.argv.includes('--retry'))returnStop();}}
   if(!r.items||r.items.length<50||page*50>=r.total)break;
  }console.log(JSON.stringify({kind,valid:count}));
 }
}finally{await pool.end();}
function returnStop(){throw Error('Stopped after first item failure');}
