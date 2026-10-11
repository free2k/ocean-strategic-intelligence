import {pool} from '../server/integrations/mp2rss-store.mjs';
import {getResource} from '../server/integrations/x-evidence.mjs';
try{console.log(JSON.stringify({aiEnabled:process.env.INTEL_ENABLE_AI==='true',model:process.env.CHAT_MODEL,visionModel:process.env.MP2_VISION_MODEL,proxyConfigured:!!(process.env.MP2_EVIDENCE_PROXY||process.env.DOWNLOAD_PROXY)}));
 const rows=(await pool.query("SELECT url FROM mp2rss.evidence_links WHERE kind='image' AND origins::text ILIKE '%LNG imports%' LIMIT 1")).rows;
 for(const row of rows){const start=Date.now();try{const r=await getResource(row.url);console.log(JSON.stringify({kind:r.kind,status:r.status,bytes:r.buffer?.length,elapsedMs:Date.now()-start}));}catch(e){console.log(JSON.stringify({error:e.message,elapsedMs:Date.now()-start}));}}
}finally{await pool.end();}
