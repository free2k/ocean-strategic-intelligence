import pg from 'pg';
import {semanticDecision} from '../intelligence/semantic-classification.mjs';
import {compileRules} from '../intelligence/industry-classification.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try{
 const compiled=compileRules({rules:(await pool.query('SELECT * FROM public.filter_rules')).rows});
 const rows=(await pool.query("SELECT a.id,a.title,i.payload->>'content' content,i.classification FROM public.articles a JOIN mp2rss.items i ON i.article_id=a.id WHERE a.id=9723 OR a.title LIKE '能源装备提质升级%' ORDER BY a.id LIMIT 2")).rows;
 for(const a of rows){const d=await semanticDecision(a,a.classification,compiled);console.log(JSON.stringify({id:a.id,title:a.title,status:d.status,topic:d.primary,reason:d.reason,semantic:d.semantic}));}
}finally{await pool.end();}
