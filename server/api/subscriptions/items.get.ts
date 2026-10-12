import {init,pool} from '../../integrations/mp2rss-store.mjs';
import {subscriptionArticles} from '../../integrations/subscription-articles.mjs';
export default defineEventHandler(async(event)=>{await init();const q=getQuery(event);const page=Math.max(1,Math.min(100000,Number(q.page)||1));
 const result=await subscriptionArticles(pool,{source:String(q.source||''),page,origin:['mp2rss','legacy'].includes(String(q.origin))?String(q.origin):'all',missing:q.body==='missing'});
 if(!result)throw createError({statusCode:404,message:'未找到该订阅账号'});
 return result;
});
