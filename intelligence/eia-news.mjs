import {mergeRecords} from './core.mjs';
export const newsSources=[
 {id:'eia-tie',name:'EIA · Today in Energy',url:'https://www.eia.gov/rss/todayinenergy.xml',scope:'海洋能源相关分析文章；RSS发现后采集正文'},
 {id:'eia-press',name:'EIA · 新闻稿',url:'https://www.eia.gov/rss/press_rss.xml',scope:'海洋能源与运输通道相关官方新闻稿；预测与实际分开'}
].map(s=>({...s,country:'US',language:'en',level:'S1',method:'rss'}));
export function marineRelevant(text){return /\boffshore\b|\bsubsea\b|\bLNG\b|liquefied natural gas|\bHormuz\b|\bMalacca\b|\bSuez\b|\bseaborne\b|\btanker\b|ocean energy|tidal energy|wave energy/i.test(text);}
export function eiaArticleUrl(link,base){const u=new URL(String(link),base);if(u.hostname!=='www.eia.gov'||!['https:','http:'].includes(u.protocol))throw new Error('Non-EIA article URL');u.protocol='https:';u.hash='';return u.href;}
export function mergeNews(live,incoming){
 const next={...live,generatedAt:new Date().toISOString()};
 for(const key of ['sources','documents','events','relations','observations','evidence']){
   const records=new Map((live[key]||[]).map(x=>[x.id,x]));
   for(const row of incoming[key]||[]){const old=records.get(row.id);if(!old||key==='sources')records.set(row.id,row);}
   next[key]=[...records.values()];
 }
 next.entities=mergeRecords([...(live.entities||[]),...(incoming.entities||[])]);
 const sourceIds=new Set(newsSources.map(s=>s.id));
 next.errors=[...(live.errors||[]).filter(e=>!sourceIds.has(e.sourceId)),...(incoming.errors||[])];
 return next;
}
