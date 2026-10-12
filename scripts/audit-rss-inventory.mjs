import {pool} from '../server/integrations/mp2rss-store.mjs';
try{
 console.log(JSON.stringify({retired:(await pool.query("SELECT s.id,s.name,count(a.id)::int articles FROM sources s LEFT JOIN articles a ON a.source_id=s.id WHERE s.type='rss_archived' GROUP BY s.id")).rows,rss:(await pool.query("SELECT s.id,s.name,s.alias,s.type,count(a.id)::int articles FROM sources s LEFT JOIN articles a ON a.source_id=s.id WHERE s.type='rss' GROUP BY s.id")).rows,
 external:(await pool.query("SELECT id,payload->>'name' name,payload->>'method' method,payload->>'url' url,payload->>'sitemap' sitemap,payload->>'status' status,payload->>'checkedAt' checked_at,payload->>'error' error FROM ocean_intel.sources WHERE payload->>'method' IS DISTINCT FROM 'api'")).rows}));
}finally{await pool.end();}
