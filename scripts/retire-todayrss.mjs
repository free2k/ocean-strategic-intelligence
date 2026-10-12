import fs from 'node:fs/promises';
import {pool} from '../server/integrations/mp2rss-store.mjs';
try{
 const sources=(await pool.query("SELECT * FROM sources WHERE type='rss'")).rows.filter(s=>{try{return new URL(s.alias).hostname==='cn.todayrss.com';}catch{return false;}});
 const file='/opt/knowledge-base/todayrss-retired-'+Date.now()+'.json';
 await fs.writeFile(file,JSON.stringify(sources,null,2),{mode:0o600});
 const ids=sources.map(s=>s.id);
 const result=await pool.query("UPDATE sources SET type='rss_archived' WHERE id=ANY($1::int[]) AND type='rss' RETURNING id,name",[ids]);
 console.log(JSON.stringify({retired:result.rows,backup:file,articlesPreserved:true}));
}finally{await pool.end();}
