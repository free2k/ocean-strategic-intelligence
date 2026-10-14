// Coverage counts event clues, not confirmed relationships or article totals.
const major=['CN','US','GB','DE','FR','JP','IN','RU','BR','CA','AU','NO','KR','SA'];
export function rankCountries(countries,coverage={}){
 const rank=code=>major.includes(code)?major.indexOf(code):major.length;
 return [...countries].sort((a,b)=>Number(Boolean(coverage[b.code]))-Number(Boolean(coverage[a.code]))||rank(a.code)-rank(b.code)||(coverage[b.code]||0)-(coverage[a.code]||0)||a.name.localeCompare(b.name,'zh-CN')||a.code.localeCompare(b.code));
}
