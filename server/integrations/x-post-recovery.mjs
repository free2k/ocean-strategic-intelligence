import {fetch,ProxyAgent} from 'undici';
import {parseHTML} from 'linkedom';
import {validateUrl} from './x-evidence.mjs';
import {boundedLookup} from './evidence-budget.mjs';

export function postId(url){try{const u=new URL(url);return u.protocol==='https:'&&/^(www\.)?(x\.com|twitter\.com)$/.test(u.hostname)?u.pathname.match(/^\/(?:i\/web|[A-Za-z0-9_]+)\/status\/(\d+)\/?$/)?.[1]:null;}catch{return null;}}
export function needsPostRecovery(p){return p.kind==='x_post'&&!String(p.content||'').trim()&&!!postId(p.url);}
export function parsePostBody(html,url){
 const id=postId(url);if(!id)throw Error('invalid_post_url');
 const {document:d}=parseHTML(html),meta=k=>d.querySelector(`meta[property="${k}"]`)?.getAttribute('content')||'';
 if(postId(meta('og:url'))!==id)throw Error('post_identity_unverified');
 const body=meta('og:description').trim();
 if(!body||/^(log in|sign in|sign up|join x|this post|this account|something went wrong)/i.test(body)||/…$|\.\.\.$/.test(body))throw Error('post_body_unverified');
 return {content:body,sourceUrl:meta('og:url'),method:'matching_post_og_description'};
}
export async function recoverPostBody(p,{proxy=process.env.MP2_X_PROXY||process.env.MP2_EVIDENCE_PROXY||process.env.DOWNLOAD_PROXY,deadline=Date.now()+30000}={}){
 if(!needsPostRecovery(p))return null;
 if(!proxy)throw Error('proxy_not_configured');
 let url=p.url;const agent=new ProxyAgent(proxy);
 try{for(let hop=0;hop<5;hop++){
  if(postId(url)!==postId(p.url))throw Error('post_redirect_unverified');
  await boundedLookup(()=>validateUrl(url),deadline);
  const remaining=Math.min(15000,deadline-Date.now());if(remaining<1)throw Error('recovery_timeout');
  const r=await fetch(url,{dispatcher:agent,redirect:'manual',headers:{'User-Agent':'OceanEnergyResearch/1.0'},signal:AbortSignal.timeout(remaining)});
  if([301,302,303,307,308].includes(r.status)){url=new URL(r.headers.get('location'),url).href;await r.body?.cancel();continue;}
  if(!r.ok){await r.body?.cancel();throw Error('post_http_'+r.status);}
  let bytes=0;const parts=[];for await(const part of r.body){bytes+=part.length;if(bytes>2*1024*1024)throw Error('post_response_too_large');parts.push(part);}
  return {...parsePostBody(Buffer.concat(parts).toString('utf8'),p.url),checkedAt:new Date().toISOString()};
 }throw Error('post_redirect_limit');}finally{await agent.destroy();}
}
