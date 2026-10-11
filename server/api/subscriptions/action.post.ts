import {enqueue,update,init,pool} from '../../integrations/mp2rss-store.mjs';
import {client,ProviderError} from '../../integrations/mp2rss-client.mjs';
export default defineEventHandler(async(event)=>{
 const origin=getHeader(event,'origin');if(origin&&new URL(origin).host!==getRequestURL(event).host)throw createError({statusCode:403,message:'跨站请求已拒绝'});
 const b=await readBody(event);try{
 if(b.action==='sync'||b.action==='refresh')return await enqueue(b.action,b.id||null);
 if(b.action==='update'){const row=await update(String(b.id),b);if(!row)throw Error('订阅不存在');return {success:true};}
 if(b.action==='subscribe'){
  const u=new URL(b.articleUrl);if(u.protocol!=='https:'||u.hostname!=='mp.weixin.qq.com'||u.username||u.password)throw Error('请填写有效公众号文章链接');
  await client()('/open-api/subscriptions',{method:'POST',body:{articleUrl:u.href}});await enqueue('refresh');return {success:true};
 }
 if(b.action==='unsubscribe'){
  if(b.confirm!==true)throw Error('请确认取消远端订阅');await init();const s=(await pool.query('SELECT payload FROM mp2rss.subscriptions WHERE id=$1',[String(b.id)])).rows[0]?.payload;
  if(!s||s.platform!=='mp')throw Error('X 账号请在供应商控制台取消');await client()('/open-api/subscriptions/'+s.remoteId,{method:'DELETE'});await enqueue('refresh');return {success:true};
 }
 throw Error('不支持的操作');
 }catch(e:any){throw createError({statusCode:e instanceof ProviderError?502:400,message:e instanceof ProviderError?e.message:'操作未完成，请核对输入和服务状态'});}
});
