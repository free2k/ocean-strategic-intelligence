import {recentCountryRows} from './public/country-ranking.mjs';
import {fail} from './research/ledger.mjs';
const pick=(row,keys)=>Object.fromEntries(keys.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
// Counts and all theme search keys stay in the first view. Evidence for themes
// beyond its first page is read only when that theme is actually displayed.
export function dashboardOverview(page){
 const data=recentCountryRows(page.data);
 return {...page,data:{...data,events:data.events.map(e=>pick(e,['id','title','countries','occurredAt','publishedAt','dateRole','stage','scheduledAt'])),themes:data.themes.map((t,i)=>i<10?t:{...pick(t,['id','name','aliases','countries','versionCount','recency']),presentation:pick(t.presentation||{},['title','titleBasis','chinese']),members:[],previewOnly:true})}};
}
export function dashboardThemes(page,ids){
 const keys=String(ids||'').split(',');if(!keys.length||keys.length>20||keys.some(id=>!/^theme_[a-f0-9]{64}$/.test(id)))fail('INVALID_SCOPE','每次最多读取20个有效主题');
 const rows=new Map(recentCountryRows(page.data).themes.map(t=>[t.id,t]));if(keys.some(id=>!rows.has(id)))fail('THEME_NOT_FOUND','主题不在当前版本和筛选范围内',404);
 return {data:keys.map(id=>rows.get(id)),meta:page.meta};
}
