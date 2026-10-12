import pg from 'pg';
import {initClassification,currentRules,decideArticle} from '../intelligence/classification-jobs.mjs';
import {compileRules} from '../intelligence/industry-classification.mjs';
import {queueSemantic} from '../intelligence/semantic-classification.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try{await initClassification(pool);const db=await pool.connect();try{
 await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(73201910)');const compiled=compileRules(await currentRules(db));
 const rows=(await db.query("SELECT a.*,i.payload->>'content' mp_content FROM public.articles a JOIN mp2rss.items i ON i.article_id=a.id WHERE (a.id=9723 OR a.title LIKE '能源装备提质升级%') AND a.filter_status='pending' AND NOT a.manual_classify AND a.classify_method IS DISTINCT FROM 'manual' FOR UPDATE OF a")).rows;
 for(const a of rows){const {decision}=decideArticle(a,compiled);if(decision.status!=='unmatched')continue;const queued=await queueSemantic(db,{...a,content:a.mp_content},compiled,decision);await db.query('UPDATE mp2rss.items SET classification=$2 WHERE article_id=$1',[a.id,queued]);console.log(JSON.stringify({id:a.id,queued:true}));}
 await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}finally{await pool.end();}
