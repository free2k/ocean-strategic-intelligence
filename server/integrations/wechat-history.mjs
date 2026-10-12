import {accountKey,parseWechatIdentity,wechatArticle,verifyWechat} from './wechat-identity.mjs';
export async function verifyWithHistory(pool,name,url,options={}){
 if(!wechatArticle(url))return verifyWechat(name,url,options);
 const rows=(await pool.query('SELECT a.id,a.content,s.name,s.fakeid FROM public.articles a JOIN public.sources s ON s.id=a.source_id WHERE a.link=$1 AND a.content IS NOT NULL ORDER BY a.updated_at DESC LIMIT 3',[url])).rows;
 for(const row of rows){if(accountKey(row.name)!==accountKey(name))continue;const p=parseWechatIdentity(row.content,url);
  if(p.hasArticle&&!p.conflict&&p.biz===row.fakeid&&/^[A-Za-z0-9+/=]{8,100}$/.test(p.biz)&&accountKey(p.publisher)===accountKey(name))return {...p,url,status:'verified',basis:'historical_original',articleId:row.id,checkedAt:new Date().toISOString(),reason:'历史原始文章中的发布账号、账号标识与旧订阅记录一致'};
 }
 return verifyWechat(name,url,options);
}
