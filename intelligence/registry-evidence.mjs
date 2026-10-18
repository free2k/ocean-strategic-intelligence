import {matchesCountry} from './country-filter.mjs';
export function selectRegistries(data,filters={}){
 return Object.fromEntries(Object.entries(data.assetRegistries||{}).flatMap(([id,r])=>{
  const topic=r.topic||(id==='boem'?'海上风电':null),country=r.country||(id==='boem'?'US':null),sourceId=r.sourceId||id;
  if(filters.topic&&filters.topic!==topic||!matchesCountry(country,filters.country)||filters.sourceId&&filters.sourceId!==sourceId)return [];
  // Dates apply to regulatory publication dates, not collection timestamps.
  // Current project/lease snapshots have no comparable publication period.
  if((filters.from||filters.to)&&id!=='fr-boem')return [];
  const rows=id==='fr-boem'?r.rows.filter(x=>(!filters.from||x.publicationDate>=filters.from)&&(!filters.to||x.publicationDate<=filters.to)):r.rows;
  return rows.length?[[id,{...r,rows}]]:[];
 }));
}
