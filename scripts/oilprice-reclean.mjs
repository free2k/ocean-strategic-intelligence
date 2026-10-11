import {pool} from '../server/integrations/mp2rss-store.mjs';
try{
 const r=await pool.query("UPDATE mp2rss.evidence_links SET status='pending',payload=payload||'{\"status\":\"pending\"}'::jsonb,next_check=now()-interval '1 day' WHERE kind='image' AND status='unsupported' AND origins @> '[{\"provider\":\"OilPrice RSS\"}]'");
 console.log(JSON.stringify({imagesScheduledForRecheck:r.rowCount}));
}finally{await pool.end();}
