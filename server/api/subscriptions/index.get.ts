import {status,pool} from '../../integrations/mp2rss-store.mjs';
import {attachBodyReasons} from '../../integrations/body-reason.mjs';
export default defineEventHandler(async()=>{try{const result=await status();await attachBodyReasons(pool,result.list);return result;}catch{throw createError({statusCode:503,message:'订阅服务暂不可用，请检查数据库与部署配置'});}});
