import {createHash} from 'node:crypto';
import {fetch as request,ProxyAgent} from 'undici';
export const hash=x=>createHash('sha256').update(x).digest('hex');
export function connection(link=process.env.MP2_RSS_LINK){
 try{const u=new URL(link);const match=u.pathname.match(/^\/feed\/([^/]+)\/(rss|atom|json)\/all\/?$/);if(u.protocol!=='https:'||u.hostname!=='mp2rss.bugcode.dev'||u.username||u.password||u.port||!match)throw 0;return {origin:u.origin,token:match[1]};}catch{throw new Error('MP2_RSS_LINK 未配置或不是官方聚合 Feed 地址');}
}
export class ProviderError extends Error{constructor(status){super(({401:'订阅凭据已失效',403:'订阅权益已过期',404:'账号未订阅或内容不存在',429:'供应商限流，请稍后重试',400:'参数不正确或订阅配额不足'})[status]||'供应商请求失败，请稍后重试');this.name='ProviderError';this.status=status;}}
export function client({link,proxy=process.env.DOWNLOAD_PROXY,fetcher=request,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const {origin,token}=connection(link);const dispatcher=proxy?new ProxyAgent(proxy):undefined;
 return async function api(route,{method='GET',body}={}){
  if(!route.startsWith('/open-api/')||route.includes('://'))throw Error('无效接口路径');
  let useProxy=false;for(let n=0;n<3;n++){
   let r;try{r=await fetcher(origin+route,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(45000),...(useProxy&&dispatcher?{dispatcher}:{})});}catch{if(n<2&&method==='GET'){useProxy=!!dispatcher;await wait(1000*(n+1));continue;}throw new ProviderError(503);}
   if(r.status===429||r.status>=500){const retry=r.headers.get('retry-after');const seconds=Number(retry);const delay=retry?(Number.isFinite(seconds)?seconds*1000:Date.parse(retry)-Date.now()):2000*(n+1);await r.body?.cancel();if(n<2&&delay<=60000){await wait(Math.max(1000,delay||1000));continue;}throw new ProviderError(r.status);}
   if(!r.ok){await r.body?.cancel();throw new ProviderError(r.status);}if(r.status===204)return null;
   try{return await r.json();}catch{throw new ProviderError(502);}
  }
 };
}
export function subscription(s){
 const platform=s.sourceType;if(!['mp','x'].includes(platform))throw Error('未知订阅类型');
 const remoteId=String(platform==='mp'?s.mpId:s.xUserId);if(!/^\d{1,64}$/.test(remoteId))throw Error('账号标识格式错误');
 return{id:platform+':'+remoteId,platform,remoteId,name:String(s.mpName||s.xDisplayName||s.xUsername||remoteId),handle:s.xUsername||null};
}
export async function subscriptions(api){const rows=[];for(let page=1;;page++){const r=await api(`/open-api/subscriptions?page=${page}&pageSize=50`);if(!Array.isArray(r.items)||!Number.isFinite(r.total))throw Error('订阅列表格式变化');rows.push(...r.items.map(subscription));if(rows.length>=r.total||r.items.length<50)return rows;}}
export function safeUrl(value){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return null;u.hash='';return u.href;}catch{return null;}}
export function plain(s){return String(s||'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\r/g,'').trim();}
function iso(value){if(typeof value!=='number'||!Number.isFinite(value)||value<946684800000)throw Error('无效发布时间');return new Date(value).toISOString();}
export function normalize(s,kind,item){
 const post=kind==='posts';const publishedAt=iso(post?item.postedAt:item.publishedAt);const content=plain(post?item.content:item.contentMarkdown);
 const url=safeUrl(s.platform==='mp'?item.originalUrl:post?(/^\d+$/.test(String(item.postId))?`https://x.com/i/web/status/${item.postId}`:null):item.url);
 if(!url)throw Error('缺少有效原文地址');if(s.platform==='mp'&&new URL(url).hostname!=='mp.weixin.qq.com')throw Error('公众号原链异常');
 const key=s.platform==='mp'?`mp:${s.remoteId}:${item.articleId}`:post?`x:posts:${item.postId}`:`x:articles:${hash(url)}`;
 if(s.platform==='mp'&&!item.articleId)throw Error('缺少文章标识');
 const context=post?{retweetedPost:item.retweetedPost||null,quotedPost:item.quotedPost||null,threadPosts:item.threadPosts||[],media:item.media||[]}:null;
 const text=content||plain(item.summary||item.description);const title=plain(item.title)||text.slice(0,90)||'X 帖子（无文本）';
 // Nested authors stay raw. Do not flatten third-party speech into the outer author's evidence.
 const contentStatus=content?'complete':post?'media_only':'pending_body';
 return {key,kind:s.platform==='mp'?'mp_article':post?'x_post':'x_article',url,title,content,summary:plain(item.summary||item.description),contentStatus,publishedAt,providerUpdatedAt:item.updatedAt?iso(item.updatedAt):null,author:s.name,source:s,context,raw:item,hash:hash(JSON.stringify({content,title,context,publishedAt})),language:/[\u4e00-\u9fff]/.test(text)?'zh':'en'};
}
export async function* items(api,s,kind,{since}={}){
 const size=s.platform==='mp'?100:50,route=s.platform==='mp'?`/open-api/subscriptions/${s.remoteId}/articles`:`/open-api/x/${s.remoteId}/${kind}`;
 for(let page=1;;page++){const r=await api(`${route}?page=${page}&pageSize=${size}`);if(!Array.isArray(r.items))throw Error('文章列表格式变化');let older=false;
  for(const raw of r.items){const timestamp=kind==='posts'?raw.postedAt:raw.publishedAt;if(since&&Number.isFinite(timestamp)&&timestamp<since){older=true;continue;}yield normalize(s,kind,raw);}
  if(older||r.items.length<size||(Number.isFinite(r.total)&&page*size>=r.total))break;
 }
}
