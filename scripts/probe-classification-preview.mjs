import pg from 'pg';
import {previewClassification} from '../intelligence/classification-jobs.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});
try{const start=Date.now();const totals=(await pool.query('SELECT count(*)::int articles,round(sum(octet_length(content))/1024.0/1024)::int content_mb FROM public.articles')).rows[0];const result=await previewClassification(pool,{});console.log(JSON.stringify({totals,...result,samples:undefined,elapsedMs:Date.now()-start,rssMb:Math.round(process.memoryUsage().rss/1024/1024)}));}finally{await pool.end();}
