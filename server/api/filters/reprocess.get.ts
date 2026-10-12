import {pool,init} from '../../integrations/mp2rss-store.mjs';
import {initClassification,previewClassification} from '../../../intelligence/classification-jobs.mjs';
export default defineEventHandler(async(event)=>{
 await init();await initClassification(pool);const q=getQuery(event);
 if(q.preview==='1')return {preview:await previewClassification(pool,{...q,pendingOnly:q.pendingOnly==='true',targeted:q.targeted==='true'})};
 const jobs=(await pool.query('SELECT id,version,scope,status,preview,result,error,created_at,started_at,finished_at FROM classification.jobs ORDER BY id DESC LIMIT 10')).rows;
 return {jobs};
});
