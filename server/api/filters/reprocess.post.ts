import {pool,init} from '../../integrations/mp2rss-store.mjs';
import {enqueueClassification} from '../../../intelligence/classification-jobs.mjs';
export default defineEventHandler(async(event)=>{
 await init();const body=await readBody(event);
 try{return await enqueueClassification(pool,body||{});}catch(e:any){throw createError({statusCode:409,message:e.message||'无法提交历史任务'});}
});
