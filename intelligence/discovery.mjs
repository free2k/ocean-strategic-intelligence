import {parseHTML} from 'linkedom';
import {clean,canonical} from './core.mjs';
export function discoverLinks(html,base,hosts){
 const {document}=parseHTML(html),out=[];
 for(const a of document.querySelectorAll('a[href]')){
  try{const u=new URL(a.getAttribute('href'),base),title=clean(a.textContent);
   if(!['https:','http:'].includes(u.protocol)||!hosts.includes(u.hostname)||title.length<8)continue;
   if(!/\/20\d{2}(?:\d{2}){0,2}\//.test(u.pathname)||! /\.html?$/.test(u.pathname))continue;
   // Do not take the first date in a shared parent list as this article's date.
   out.push({url:canonical(u.href),title});
  }catch{}
 }
 return out;
}
export async function discoverWeb(source,get){
 const pages=source.discoverPages||[source.discover||source.url];
 const hosts=source.allowedHosts||[new URL(source.url).hostname];
 const found=[],failures=[];
 for(const page of pages){try{found.push(...discoverLinks((await get(page)).text,page,hosts));}catch{failures.push(page);}}
 if(failures.length===pages.length)throw new Error('全部发现入口获取失败');
 for(const url of source.seeds||[])found.push({url});
 const unique=[...new Map(found.map(x=>[x.url,x])).values()];
 const dateKey=u=>(u.match(/\/(20\d{6})\//)||u.match(/t(20\d{6})_/))?.[1]||'';
 unique.sort((a,b)=>dateKey(b.url).localeCompare(dateKey(a.url)));
 return {candidates:unique,discovery:{pages:pages.length,failedPages:failures,candidates:unique.length,mode:'list-and-seed-fallback'}};
}
