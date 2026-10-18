import {publicationDates} from '../../intelligence/temporal-dates.mjs';
import {remainingMs,boundedLookup} from './evidence-budget.mjs';
import {parseHTML} from 'linkedom';
import {Readability} from '@mozilla/readability';
import {fetch,Agent,ProxyAgent} from 'undici';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {normalize,hash} from './mp2rss-client.mjs';

export function canonicalUrl(value,base){const u=new URL(value,base);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port))throw Error('unsafe_url');u.hash='';for(const k of [...u.searchParams.keys()])if(/^(utm_|fbclid|gclid)/i.test(k))u.searchParams.delete(k);return u.href;}
export function publicAddress(ip){if(isIP(ip)===4){const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&[18,19].includes(b));}return isIP(ip)===6&&/^2[0-9a-f]{3}:/i.test(ip);}
export async function validateUrl(value){const url=canonicalUrl(value),host=new URL(url).hostname.replace(/^\[|\]$/g,'');const records=isIP(host)?[{address:host}]:await lookup(host,{all:true});if(!records.length||records.some(r=>!publicAddress(r.address)))throw Error('unsafe_address');return url;}
const json=(s,fallback)=>{try{return typeof s==='string'?JSON.parse(s):s||fallback;}catch{return fallback;}};
export function expandPosts(item){
 const out=[item],seen=new Set([item.key]);
 function walk(raw,relation,parent,depth){if(!raw||depth>6)return;raw=json(raw,null);if(!raw||typeof raw!=='object')return;
  const postId=String(raw.postId||raw.post_id||'');if(!/^\d+$/.test(postId))return;
  const user=raw.user_info||{},author=user.display_name||raw.author?.name||null;
  const time=raw.postedAt??(raw.posted_at?Number(raw.posted_at)*1000:null);if(!time||!author)return;
  const source={...item.source,name:author,handle:user.username||null};
  const p=normalize(source,'posts',{...raw,postId,postedAt:time,media:json(raw.media,[]),threadPosts:json(raw.threadPosts||raw.thread_posts,[]),quotedPost:json(raw.quotedPost||raw.quoted_post,null),retweetedPost:json(raw.retweetedPost||raw.retweeted_post,null)});
  p.discovery={rootPostUrl:item.url,parentPostUrl:parent,relation,subscriptionId:item.source.id};
  if(seen.has(p.key))return;seen.add(p.key);out.push(p);children(p,depth+1);
 }
 function children(p,depth){for(const r of p.context?.threadPosts||[])walk(r,'thread',p.url,depth);walk(p.context?.quotedPost,'quoted',p.url,depth);walk(p.context?.retweetedPost,'retweeted',p.url,depth);}
 children(item,0);return out;
}
export function postLinks(item){return [...new Set((item.content.match(/https?:\/\/[^\s<>"\]\)]+/g)||[]).map(u=>{try{return canonicalUrl(u.replace(/[.,;!?，。]+$/,''));}catch{return null;}}).filter(Boolean))];}
export function mediaLinks(item){return (item.context?.media||[]).filter(x=>x.type==='photo'||x.type==='image').map(x=>({url:x.url,caption:item.content,postUrl:item.url,kind:'image'}));}
export function intermediary(html,url){const {document}=parseHTML(html);const refresh=document.querySelector('meta[http-equiv="refresh" i]')?.getAttribute('content');if(refresh){const m=refresh.match(/url\s*=\s*["']?(.+?)["']?$/i);if(m)return canonicalUrl(m[1],url);}
 if(new URL(url).hostname==='okt.to'){const candidates=[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href'));const scripted=html.match(/(?:window\.)?location(?:\.href)?\s*=\s*["'](https?:[^"']+)/)?.[1];if(scripted)candidates.unshift(scripted);return candidates.map(x=>{try{return canonicalUrl(x,url);}catch{return null;}}).find(x=>x&&new URL(x).hostname!=='okt.to')||null;}return null;}
const trim=x=>String(x||'').replace(/\s+/g,' ').trim();
export function parseArticle(html,url){
 const {document}=parseHTML(html);const meta=(key)=>document.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.getAttribute('content');
 const jsonld=[...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(s=>{const r=json(s.textContent,{});return Array.isArray(r)?r:r['@graph']||[r];});const article=jsonld.find(x=>/Article|Report|BlogPosting/.test(String(x['@type'])))||{};
 const event=jsonld.find(x=>/Event/.test(String(x['@type'])))||{};const publishedDateSource=meta('article:published_time')?'article:published_time':article.datePublished?'datePublished':null;const date=meta('article:published_time')||article.datePublished;const publishedAt=date&&Number.isFinite(Date.parse(date))?new Date(date).toISOString():null;const scheduledAt=event.startDate||(/\/events?\//i.test(new URL(url).pathname)?document.querySelector('time[datetime]')?.getAttribute('datetime'):null);
 const restricted=article.isAccessibleForFree===false||article.isAccessibleForFree==='False'||!!document.querySelector('[class*="paywall"],[id*="paywall"]');
 const parsed=new Readability(document.cloneNode(true),{charThreshold:180}).parse();
 const oilprice=new URL(url).hostname==='oilprice.com'?document.querySelector('#article-content,#news-content')?.cloneNode(true):null;
 if(oilprice){for(const node of oilprice.querySelectorAll('p'))if(/^More Top Reads From Oilprice\.com/i.test(node.textContent.trim())){let next=node.nextSibling;while(next){const current=next;next=next.nextSibling;current.remove();}node.remove();}oilprice.querySelectorAll('[data-freestar-ad]').forEach(n=>n.remove());}
 const primary=oilprice||document.querySelector('article,main')?.cloneNode(true);
 primary?.querySelectorAll('script,style,nav,header,footer,form,button,noscript').forEach(n=>n.remove());
 const {document:body}=parseHTML(oilprice?oilprice.outerHTML:primary&&trim(primary.textContent).length>(parsed?.textContent?.length||0)*1.4?primary.outerHTML:parsed?.content||primary?.outerHTML||'');
 body.querySelectorAll('script,style,nav,header,footer,form,button,noscript').forEach(n=>n.remove());
 const tables=[...body.querySelectorAll('table')].map((t,i)=>({kind:'table',index:i,title:trim(t.querySelector('caption')?.textContent),rows:[...t.querySelectorAll('tr')].map(r=>[...r.querySelectorAll('th,td')].map(c=>trim(c.textContent))),status:'needs_review',sourceUrl:url,precision:'source_cells',automaticSeries:false}));
 const assets=[...body.querySelectorAll('img')].map(n=>({kind:'image',url:n.getAttribute('data-src')||n.getAttribute('src'),caption:trim([n.getAttribute('alt'),n.closest('figure')?.querySelector('figcaption')?.textContent].filter(Boolean).join(' ? ')),status:'pending'})).filter(x=>x.url).map(x=>{try{return {...x,url:canonicalUrl(x.url,url)};}catch{return null;}}).filter(Boolean);
 const references=[...body.querySelectorAll('a[href]')].flatMap(a=>{try{return [{url:canonicalUrl(a.getAttribute('href'),url),label:trim(a.textContent)}];}catch{return [];}});
 const attachments=[...body.querySelectorAll('a[href]')].map(a=>{try{return canonicalUrl(a.getAttribute('href'),url);}catch{return null;}}).filter(u=>u&&/\.(pdf|csv|xlsx?)(\?|$)/i.test(u));
 body.querySelectorAll('p,h1,h2,h3,h4,li,tr,div').forEach(n=>n.appendChild(body.createTextNode('\n')));
 const content=(body.body?.textContent?.trim()||body.documentElement?.textContent?.trim()||trim(parsed?.textContent)).replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n\n').trim();
 return {...publicationDates({url,publishedAt,publishedDateSource,scheduledAt}),title:trim(meta('og:title')||article.headline||parsed?.title||document.querySelector('title')?.textContent),content,publishedPrecision:date?/T/.test(date)?'second':'day':null,author:trim(article.author?.name||meta('author')||new URL(url).hostname),language:/[\u4e00-\u9fff]/.test(content.slice(0,500))?'zh':'en',access:restricted?'restricted':content.length<180?'partial':'public',tables,assets,attachments,references};
}
export async function getResource(start,{proxy=process.env.MP2_EVIDENCE_PROXY||process.env.DOWNLOAD_PROXY,maxBytes=12*1024*1024,deadline=Date.now()+120000}={}){
 const chain=[];let url=start;
 for(let step=0;step<10;step++){
  url=await boundedLookup(()=>validateUrl(url),deadline);if(chain.includes(url))throw Error('redirect_loop');chain.push(url);
  if(/(^|\.)(x\.com|twitter\.com)$/.test(new URL(url).hostname))return {url,chain,kind:'social',status:200};
  let response,agent;
  // Pin validated DNS on direct connections; the configured proxy is trusted egress only.
  for(const viaProxy of [false,true]){if(viaProxy&&!proxy)break;agent=viaProxy?new ProxyAgent(proxy):new Agent({connect:{lookup:(host,opts,cb)=>lookup(host,{all:true}).then(rows=>{if(rows.some(r=>!publicAddress(r.address)))throw Error('unsafe_address');cb(null,opts.all?rows:rows[0].address,rows[0].family);}).catch(cb)}});
   try{response=await fetch(url,{dispatcher:agent,redirect:'manual',headers:{'User-Agent':'OceanEnergyResearch/1.0 (+source-attributed research)','Accept':'text/html,application/pdf,text/csv,*/*'},signal:AbortSignal.timeout(remainingMs(deadline,30000))});if(response.status===403&&!viaProxy&&proxy){await response.body?.cancel();await agent.destroy();continue;}break;}catch(e){await agent.destroy();if(e.code==='BATCH_DEFERRED'||viaProxy||!proxy)throw e;}}
  try{if([301,302,303,307,308].includes(response.status)){url=canonicalUrl(response.headers.get('location'),url);await response.body?.cancel();continue;}
   if(!response.ok){await response.body?.cancel();return {url,chain,status:response.status,kind:'unavailable'};}
   if(Number(response.headers.get('content-length'))>maxBytes){await response.body?.cancel();throw Error('resource_too_large');}
   const pieces=[];let size=0;for await(const piece of response.body){size+=piece.length;if(size>maxBytes)throw Error('resource_too_large');pieces.push(piece);}const buffer=Buffer.concat(pieces),type=imageMime(buffer)||response.headers.get('content-type')||'';
   if(type.includes('html')){const text=buffer.toString('utf8'),next=intermediary(text,url);if(next){url=next;continue;}return {url,chain,status:200,kind:'html',buffer,type};}
   return {url,chain,status:200,kind:type.startsWith('image/')?'image':type.includes('pdf')||/\.pdf(\?|$)/i.test(url)?'pdf':/csv|spreadsheet|excel/.test(type)||/\.(csv|xlsx?)(\?|$)/i.test(url)?'table':'unsupported',buffer,type};
  }finally{await agent.destroy();}
 }
 throw Error('too_many_redirects');
}
export const contentHash=p=>hash(JSON.stringify([p.title,p.content]));
// Some publisher CDNs return image bytes as application/octet-stream.
export function imageMime(buffer){
 if(buffer.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])))return 'image/jpeg';
 if(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP')return 'image/webp';
 if(/^GIF8[79]a$/.test(buffer.toString('ascii',0,6)))return 'image/gif';
 return null;
}
