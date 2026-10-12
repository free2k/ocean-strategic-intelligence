import {init,pool,persistItem,enqueue} from '../../integrations/mp2rss-store.mjs';
import {cleanMPContent} from '../../integrations/mp-content-clean.mjs';
import {compileRules} from '../../../intelligence/industry-classification.mjs';
export default defineEventHandler(async(event)=>{
 const body=await readBody(event);const text=String(body?.content||'').trim();
 if(!body?.itemId||text.length>300000||cleanMPContent(text).content.length<80)throw createError({statusCode:400,message:'请粘贴至少 80 字、最多 30 万字的原文正文'});
 await init();const item=(await pool.query('SELECT * FROM mp2rss.items WHERE id=$1',[String(body.itemId)])).rows[0];
 if(!item||item.payload.kind!=='mp_article')throw createError({statusCode:404,message:'未找到公众号文章'});
 const source=(await pool.query('SELECT * FROM mp2rss.subscriptions WHERE id=$1',[item.subscription_id])).rows[0];
 await persistItem(source,{...item.payload,key:item.id},compileRules({rules:(await pool.query('SELECT * FROM public.filter_rules')).rows}),{manualBody:text});
 const job=await enqueue('sync',source.id);
 return {success:true,jobId:job.id};
});
