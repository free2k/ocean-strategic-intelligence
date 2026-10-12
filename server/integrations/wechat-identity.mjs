import {parseHTML} from 'linkedom';
import {getResource} from './x-evidence.mjs';
export const accountKey=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
export function wechatArticle(value){try{const u=new URL(String(value).replaceAll('&amp;','&'));if(!['http:','https:'].includes(u.protocol)||u.hostname!=='mp.weixin.qq.com'||u.username||u.password||u.port||!/^\/s(?:\/|$)/.test(u.pathname))return null;u.protocol='https:';u.hash='';return u.href;}catch{return null;}}
const decode=s=>{const {document}=parseHTML('<span>'+String(s||'').replaceAll('<','&lt;')+'</span>');return document.querySelector('span').textContent.replace(/\\x([0-9a-f]{2})/gi,(_,n)=>String.fromCharCode(parseInt(n,16))).replace(/\\u([0-9a-f]{4})/gi,(_,n)=>String.fromCharCode(parseInt(n,16))).trim();};
export function parseWechatIdentity(html,url){
 const {document}=parseHTML(html),publisher=decode(document.querySelector('#js_name')?.textContent||document.querySelector('.profile_nickname')?.textContent||html.match(/\b(?:var\s+)?nickname\s*[:=]\s*(?:htmlDecode\()?\s*["']([^"']+)["']/)?.[1]);
 const declaredBiz=html.match(/\b(?:var\s+)?biz\s*=\s*["']([A-Za-z0-9+/=]+)["']/)?.[1]||html.match(/\b(?:var\s+)?biz\s*=\s*["']["']\s*\|\|\s*["']([A-Za-z0-9+/=]+)["']/)?.[1]||'';
 const urlBiz=new URL(url).searchParams.get('__biz')||'',biz=declaredBiz||urlBiz;
 const body=document.querySelector('#js_content')?.textContent?.trim()||'';
 return {publisher,biz,title:document.querySelector('#activity-name')?.textContent?.trim()||document.querySelector('meta[property="og:title"]')?.getAttribute('content')||'',bodyLength:body.length,conflict:!!(declaredBiz&&urlBiz&&declaredBiz!==urlBiz),hasArticle:body.length>=80};
}
export async function verifyWechat(name,input,{fetchPage=getResource}={}){
 const url=wechatArticle(input);if(!url)return {status:'invalid',url:input,reason:'不是公众号文章原链接'};
 try{const r=await fetchPage(url,{maxBytes:3*1024*1024});if(r.kind!=='html'||!wechatArticle(r.url))return {status:'unavailable',url,reason:'原文无法访问或跳转至验证页面'};
  const identity=parseWechatIdentity(r.buffer.toString('utf8'),r.url),verified=identity.hasArticle&&!identity.conflict&&/^[A-Za-z0-9+/=]{8,100}$/.test(identity.biz)&&accountKey(name)===accountKey(identity.publisher);
  return {status:verified?'verified':identity.publisher&&accountKey(name)!==accountKey(identity.publisher)?'mismatch':'unverified',url:r.url,...identity,checkedAt:new Date().toISOString(),reason:verified?'文章发布账号名称一致，已取得账号标识和正文':identity.publisher?'发布账号不一致或身份依据不足':'未取得发布账号，可能需要微信验证'};
 }catch{return {status:'unavailable',url,reason:'原文获取失败，未自动放行'};}
}
