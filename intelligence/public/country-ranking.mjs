// Coverage counts event clues, not confirmed relationships or article totals.
const major=['CN','US','GB','DE','FR','JP','IN','RU','BR','CA','AU','NO','KR','SA'];
export function rankCountries(countries,coverage={}){
 const rank=code=>major.includes(code)?major.indexOf(code):major.length;
 return [...countries].sort((a,b)=>Number(Boolean(coverage[b.code]))-Number(Boolean(coverage[a.code]))||rank(a.code)-rank(b.code)||(coverage[b.code]||0)-(coverage[a.code]||0)||a.name.localeCompare(b.name,'zh-CN')||a.code.localeCompare(b.code));
}

// Read-time ordering only: never rewrites immutable source dates or publications.
const day=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:$|T| )/.test(value))return null;const d=value.slice(0,10),t=Date.parse(d+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===d?d:null;};
export function eventRecency(event={},today=new Date(Date.now()+8*3600000).toISOString().slice(0,10)){
 const occurred=day(event.occurredAt||event.eventDate),published=day(event.publishedAt),planned=event.dateRole==='planned_or_unconfirmed'||event.stage==='planned'||!!event.scheduledAt;
 if(occurred&&occurred<=today&&!planned)return {date:occurred,basis:'occurred',label:'发生日期 '+occurred};
 if(published&&published<=today)return {date:published,basis:'published',label:'报道日期 '+published};
 return {date:null,basis:'unknown',label:'发生及报道日期未明确'};
}
const compare=(a,b)=>(b.recency?.date||'').localeCompare(a.recency?.date||'')||String(a.id||a.eventId||'').localeCompare(String(b.id||b.eventId||''));
export function recentCountryRows(payload,now=Date.now()){
 const today=new Date(+new Date(now)+8*3600000).toISOString().slice(0,10),events=new Map((payload.events||[]).map(e=>[e.id,e]));
 const themes=(payload.themes||[]).map(t=>{const members=t.members.map(m=>({...m,recency:eventRecency(events.get(m.eventId)||m,today)})).sort(compare);return {...t,members,recency:members[0]?.recency||eventRecency({},today)};}).sort(compare);
 const coOccurrences=(payload.coOccurrences||[]).map(r=>({...r,recency:eventRecency(events.get(r.eventId)||r,today)})).sort(compare);
 return {...payload,themes,coOccurrences};
}
