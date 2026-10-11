// Conservative parsing: retain raw evidence; no model-proposed unit conversion.
export function exactValue(raw,unit){
 const text=String(raw??'').trim().replace(/,/g,'');
 if(!unit||/约|超|余|近|至少|以上|以下|[<>≤≥~～]|more than|over\b|up to|at least|approximately|around|nearly/i.test(text))return null;
 let body=text.endsWith(unit)?text.slice(0,-unit.length).trim():text;
 if(/^[+-]?\d{1,3}(?:[ \u00a0]\d{3})+(?:\.\d+)?$/.test(body))body=body.replace(/[ \u00a0]/g,'');
 const m=body.match(/^([+-]?\d+(?:\.\d+)?)\s*(万|亿|million|billion)?$/i);
 if(!m)return null;
 const scale={万:1e4,亿:1e8,million:1e6,billion:1e9}[m[2]?.toLowerCase()]||1;
 // A magnitude already present in the unit must not be applied twice.
 if(m[2]&&/万|亿|million|billion/i.test(unit))return null;
 const value=Number(m[1])*scale;return Number.isFinite(value)?value:null;
}
export function comparableGroups(observations){
 const groups=new Map(),rejected=[];
 for(const o of observations){
  const value=exactValue(o.rawValue,o.unit);
  if(!o.included||!o.subject||!o.name||!o.nature||value===null||!o.proof?.some(p=>String(p.quote).includes(String(o.rawValue)))){rejected.push({id:o.id,reason:'缺少严格数值、口径字段或逐字数值证据'});continue;}
  const metricName=o.name.startsWith(o.subject)?o.name.slice(o.subject.length).trim():o.name;
  if(!metricName)continue;
  const key=JSON.stringify([o.documentId,metricName,o.unit,o.nature,o.period||'']);
  const rows=groups.get(key)||[];rows.push({...o,metricName,value,label:o.subject});groups.set(key,rows);
 }
 return {groups:[...groups.entries()].flatMap(([key,rows])=>{
  const bySubject=new Map();let conflict=false;
  for(const row of rows){const prior=bySubject.get(row.subject);if(prior&&prior.value!==row.value)conflict=true;bySubject.set(row.subject,row);}
  // Same disclosure and exact metric identity only; never pool publications.
  return !conflict&&bySubject.size>=2?[{key,rows:[...bySubject.values()]}]:[];
 }),rejected};
}
