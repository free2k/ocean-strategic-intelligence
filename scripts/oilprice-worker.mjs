import {pool} from '../server/integrations/mp2rss-store.mjs';
import {discoverOilprice,feeds} from '../server/integrations/oilprice.mjs';
import {processXEvidence} from '../server/integrations/x-evidence-store.mjs';
try{
 if(process.argv.includes('--register')){
  for(const f of feeds)await pool.query("INSERT INTO public.sources(fakeid,name,alias,type,is_overseas) VALUES($1,$2,$3,'rss',true) ON CONFLICT(fakeid) DO NOTHING",[f.id,f.name,f.url]);
  console.log('Registered OilPrice RSS sources');
 }else if(process.argv.includes('--status')){
  for(const sql of ["SELECT id,payload FROM mp2rss.state WHERE id='oilprice-sync'", "SELECT status,count(*)::int count FROM mp2rss.evidence_links WHERE origins @> '[{\"provider\":\"OilPrice RSS\"}]' GROUP BY status", "SELECT classification->>'status' status,classification->>'primary' topic,count(*)::int count FROM mp2rss.evidence_documents WHERE payload->'origins' @> '[{\"provider\":\"OilPrice RSS\"}]' GROUP BY 1,2"] )console.log(JSON.stringify((await pool.query(sql)).rows));
 }else{
  console.log(JSON.stringify(await discoverOilprice()));
  const deadline=Date.now()+20*60000;
  console.log(JSON.stringify(await processXEvidence({provider:'OilPrice RSS',deadline})));
  // Second pass picks up images/attachments found in the article pass; persistent jobs survive deadlines.
  if(Date.now()<deadline)console.log(JSON.stringify(await processXEvidence({provider:'OilPrice RSS',deadline})));
  try{const base='http://127.0.0.1:3101',r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:process.env.SITE_PASSWORD})});
   if(!r.ok)throw Error();const cookie=r.headers.get('set-cookie')?.split(';')[0];const p=await fetch(base+'/api/process',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:'{}'});console.log(JSON.stringify({processingRequested:p.status===202,busy:p.status===409}));
  }catch{console.log('Intelligence import deferred to scheduled processing');}
 }
}catch{console.error('OilPrice collection failed; retained data and queue are safe');process.exitCode=1;}finally{await pool.end();}
