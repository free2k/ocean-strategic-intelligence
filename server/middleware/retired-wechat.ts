export default defineEventHandler(event=>{
 const p=getRequestURL(event).pathname;
 if(/^\/api\/wechat\/(auth|accounts|download)(\/|$)/.test(p)||/^\/api\/wechat\/articles\/sync/.test(p))throw createError({statusCode:410,message:'旧扫码采集已停用，请使用订阅管理中的 Mp2RSS 渠道'});
});
