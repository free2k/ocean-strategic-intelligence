import {init,pool} from '../../integrations/mp2rss-store.mjs';
import {planImport,enqueueBatch} from '../../integrations/mp2rss-batch.mjs';
import {enqueueDiscovery,enqueueVerified} from '../../integrations/mp-discovery.mjs';
export default defineEventHandler(async event=>{
 const origin=getHeader(event,'origin');if(origin&&new URL(origin).host!==getRequestURL(event).host)throw createError({statusCode:403,message:'跨站请求已拒绝'});
 const b=await readBody(event);await init();
 try{if(b.action==='preview')return {rows:planImport(b.text,(await pool.query('SELECT id,payload,present FROM mp2rss.subscriptions')).rows)};
 if(b.action==='discover')return await enqueueDiscovery(pool,b.names,b.autoSubscribe===true);
 if(b.action==='subscribe_verified')return await enqueueVerified(pool,b.names);
 if(b.action==='batch_unsubscribe'&&b.confirm!==true)throw Error('请确认取消所选远端订阅');
 return await enqueueBatch(pool,b.action,b.entries);
 }catch(e:any){throw createError({statusCode:400,message:e.message});}
});
