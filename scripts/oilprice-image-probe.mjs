import {pool} from '../server/integrations/mp2rss-store.mjs';
import {getResource} from '../server/integrations/x-evidence.mjs';
try{
 const jobs=(await pool.query("SELECT url,payload FROM mp2rss.evidence_links WHERE kind='image' AND origins @> '[{\"provider\":\"OilPrice RSS\"}]' LIMIT 2")).rows;
 for(const j of jobs){const r=await getResource(j.url);console.log(JSON.stringify({url:j.url,status:r.status,kind:r.kind,type:r.type,bytes:r.buffer?.length,magic:r.buffer?.subarray(0,16).toString('hex')}));}
}finally{await pool.end();}
