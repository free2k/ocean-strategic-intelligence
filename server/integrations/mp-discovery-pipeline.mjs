import {parseHTML} from 'linkedom';
import {getResource} from './x-evidence.mjs';
import {accountKey,wechatArticle,verifyWechat} from './wechat-identity.mjs';

export async function localCandidates(pool,name){
 const sources=(await pool.query('SELECT id,name,alias FROM public.sources')).rows.filter(s=>[s.name,s.alias].some(n=>n&&accountKey(n)===accountKey(name)));
 const active=(await pool.query('SELECT id,payload FROM mp2rss.subscriptions WHERE present')).rows.filter(s=>s.payload.platform==='mp'&&accountKey(s.payload.name)===accountKey(name));
 const articles=sources.length?(await pool.query('SELECT id,link,title,source_id FROM public.articles WHERE source_id=ANY($1::int[]) ORDER BY (content IS NOT NULL) DESC,published_at DESC LIMIT 100',[sources.map(s=>s.id)])).rows:[];
 const old=(await pool.query('SELECT payload FROM mp2rss.discovery WHERE name=$1',[name])).rows[0]?.payload;
 const links=articles.map(a=>({url:wechatArticle(a.link),title:a.title,articleId:a.id,publisher:sources.find(s=>s.id===a.source_id)?.name,discoveredFrom:'local:article:'+a.id})).filter(a=>a.url);
 for(const c of old?.candidates||[]){const url=wechatArticle(c.inputUrl||c.url);if(url)links.push({url,discoveredFrom:'local:previous-search'});}
 return {active,sources,links:[...new Map(links.map(a=>[a.url,a])).values()].slice(0,6)};
}

export async function discoveryPipeline(name,{local={active:[],sources:[],links:[]},search,fetchPage=getResource,verify=verifyWechat,progress=async()=>{}}={}){
 const candidates=[],sources=[],stages=[],queries=[],seen=new Set();let model=null;
 const save=async(stage,status,reason)=>{stages.push({stage,status,reason,at:new Date().toISOString()});await progress({name,status:'running',stage,candidates:[...candidates],sources:[...sources],stages:[...stages]});};
 const hasMatch=()=>candidates.some(c=>c.status==='verified');
 const check=async(links,limit=4)=>{let count=0;for(const link of links){const url=wechatArticle(link.url);if(!url||seen.has(url))continue;if(count++>=limit)break;seen.add(url);const proof=await verify(name,url,{fetchPage});candidates.push({...proof,inputUrl:url,discoveredFrom:link.discoveredFrom,articleId:link.articleId});}};
 const expand=async(results)=>{const links=[];for(const s of results.slice(0,3)){if(wechatArticle(s.url))continue;try{const page=await fetchPage(s.url,{maxBytes:2*1024*1024});if(page.kind!=='html')continue;const {document}=parseHTML(page.buffer.toString('utf8'));for(const a of document.querySelectorAll('a[href]')){let url;try{url=wechatArticle(new URL(a.getAttribute('href'),page.url).href);}catch{}if(url)links.push({url,discoveredFrom:s.url});}}catch{}}return links;};
 await save('本地历史资料','running','查询旧公众号及历史文章原文链接');
 if(local.active.length===1)return {name,status:'existing',publisher:local.active[0].payload.name,subscriptionId:local.active[0].id,reason:'已在 Mp2RSS 订阅，无需重复添加',candidates,sources,stages,checkedAt:new Date().toISOString()};
 if(local.active.length>1)return {name,status:'ambiguous',reason:'远端存在多个同名账号，请核对',candidates,sources,stages,checkedAt:new Date().toISOString()};
 await check(local.links,6);await save('本地历史资料','completed',`找到 ${local.links.length} 个历史候选链接，${candidates.filter(c=>c.status==='verified').length} 个通过核验`);
 if(!hasMatch()){
  const url='https://weixin.sogou.com/weixin?type=2&query='+encodeURIComponent('"'+name+'"');
  await save('微信专项搜索','running','搜索公众号文章原链接');
  try{const page=await fetchPage(url,{maxBytes:2*1024*1024});const html=page.buffer?.toString('utf8')||'';
   if(page.kind!=='html'||/antispider|验证码|访问过于频繁/.test(html))await save('微信专项搜索','blocked','搜索页面要求验证或无法访问，可使用人工搜索入口');
   else {const {document}=parseHTML(html),links=[];let redirects=0;
    for(const a of document.querySelectorAll('a[href]')){let u;try{u=new URL(a.getAttribute('href'),page.url);}catch{continue;}const direct=wechatArticle(u.href);if(direct)links.push({url:direct,discoveredFrom:url});
     else if(u.hostname==='weixin.sogou.com'&&u.pathname==='/link'&&redirects++<3){try{const target=await fetchPage(u.href,{maxBytes:2*1024*1024});const article=wechatArticle(target.url);if(article)links.push({url:article,discoveredFrom:url});}catch{}}
    }sources.push({title:'搜狗微信专项搜索',url});await check(links);await save('微信专项搜索','completed',`发现 ${links.length} 个文章链接`);
   }
  }catch{await save('微信专项搜索','blocked','搜索连接失败，已转其他渠道');}
 }
 if(!hasMatch())for(const [stage,query] of [['文章定向搜索','"'+name+'" 微信公众号 文章 site:mp.weixin.qq.com'],['官网交叉搜索','"'+name+'" 公众号 官网 原文 链接 运营机构']]){
  await save(stage,'running','联网检索真实来源并展开原文链接');
  try{const result=await search(name,{query});model=result.model;queries.push({query,requestId:result.requestId,usage:result.usage});sources.push(...result.sources);await check(result.sources.map(s=>({...s,discoveredFrom:s.url})));if(!hasMatch())await check(await expand(result.sources.filter(s=>!wechatArticle(s.url))));await save(stage,'completed',`返回 ${result.sources.length} 个搜索来源`);}catch(e){await save(stage,'failed',/Qwen|百炼|模型|凭据/.test(e.message)?e.message:'搜索连接失败');}
  if(hasMatch())break;
 }
 const matches=candidates.filter(c=>c.status==='verified'),bizs=new Set(matches.map(c=>c.biz)),status=bizs.size>1?'ambiguous':matches.length?'verified':candidates.length?'needs_review':'not_found';
 return {name,status,url:status==='verified'?matches[0].url:null,biz:status==='verified'?matches[0].biz:null,publisher:status==='verified'?matches[0].publisher:null,candidates,sources:[...new Map(sources.map(s=>[s.url,s])).values()],stages,queries,model,checkedAt:new Date().toISOString(),reason:status==='verified'?'原文发布账号核验一致':status==='ambiguous'?'多个同名账号标识，需人工确认':candidates.length?'已找到文章链接，但原文身份核验未通过':'多渠道未找到可核验链接，请人工补充'};
}
