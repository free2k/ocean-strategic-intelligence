import {pool} from '../server/integrations/mp2rss-store.mjs';
try{
 const state=(await pool.query("SELECT payload FROM mp2rss.state WHERE id='x-evidence'")).rows;
 const docs=(await pool.query("SELECT payload->>'titleZh' title,payload->>'url' url,payload->>'status' status,length(payload->>'content') original_chars,length(payload->>'contentZh') chinese_chars,jsonb_array_length(payload->'assets') images,classification->>'status' classification,classification->>'primary' topic FROM mp2rss.evidence_documents WHERE payload->'origins' @> '[{\"provider\":\"OilPrice RSS\"}]'")).rows;
 const assets=(await pool.query("SELECT status,kind,count(*)::int count FROM mp2rss.evidence_links WHERE kind<>'link' AND origins @> '[{\"provider\":\"OilPrice RSS\"}]' GROUP BY 1,2")).rows;
 const delivered=(await pool.query("SELECT payload->>'titleZh' title,payload->'autoExtraction'->>'status' extraction,jsonb_array_length(coalesce(payload->'extraction'->'events','[]'::jsonb)) events,jsonb_array_length(coalesce(payload->'extraction'->'observations','[]'::jsonb)) metrics FROM ocean_intel.documents WHERE payload->>'provider'='OilPrice RSS'")).rows;
 const charts=(await pool.query("SELECT payload->>'title' title,payload->>'kind' kind,payload->>'summaryZh' summary,payload->>'automaticSeries' automatic_series FROM mp2rss.evidence_links WHERE status='model_candidate' AND origins @> '[{\"provider\":\"OilPrice RSS\"}]' LIMIT 3")).rows;
 console.log(JSON.stringify({state,documents:process.argv.includes('--brief')?docs.length:docs,assets,charts,delivered}));
 const r=await fetch('http://127.0.0.1:3000/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:process.env.SITE_PASSWORD})});
 if(!r.ok)throw Error();const cookie=r.headers.get('set-cookie')?.split(';')[0];
 const sources=await fetch('http://127.0.0.1:3000/api/rss/sources',{headers:{cookie}});const list=(await sources.json()).list.filter(s=>s.fakeid?.startsWith('oilprice-'));
 const ev=await fetch('http://127.0.0.1:3000/api/subscriptions/evidence',{headers:{cookie}});
 console.log(JSON.stringify({rssAPI:sources.status,oilpriceSources:list.map(s=>({name:s.name,url:s.alias,overseas:s.isOverseas})),evidenceAPI:ev.status}));
}catch{console.error('Verification failed');process.exitCode=1;}finally{await pool.end();}
