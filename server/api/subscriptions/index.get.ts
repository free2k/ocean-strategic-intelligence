import {status} from '../../integrations/mp2rss-store.mjs';
export default defineEventHandler(async()=>{try{return await status();}catch{throw createError({statusCode:503,message:'订阅服务暂不可用，请检查数据库与部署配置'});}});
