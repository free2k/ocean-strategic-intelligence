import {setImmediate} from 'node:timers/promises';
import {snapshotEntries} from './snapshot-reader.mjs';
import {isComplete} from './auto-extract.mjs';

const structured=['events','relations','observations'];
const protectedRow=row=>row?.manual||row?.reviewedAt||row?.method==='官方原文规则校验';
// Keep existing rows by reference. Consume and merge one staged article/fact at
// a time rather than assembling a second full workspace before merging it.
export async function mergeSnapshotFile(live,file){
 const next={...live},processed=new Set(),fields=['sources','documents','entities','evidence','series',...structured];
 const maps=new Map(fields.map(key=>[key,new Map((live[key]||[]).map(row=>[row.id,row]))]));
 const seen=new Map(structured.map(key=>[key,new Set()]));let articles=0,count=0;
 for await(const {field,array,start,value} of snapshotEntries(file)){
  if(start){if(!maps.has(field))next[field]=[];continue;}
  if(!array){next[field]=value;continue;}
  if(!maps.has(field)){next[field].push(value);continue;}
  if(!value?.id)throw Error('Invalid staged row: '+field);
  const map=maps.get(field),old=map.get(value.id);
  if(field==='documents'){articles++;if(isComplete(value))processed.add(value.id);}
  seen.get(field)?.add(value.id);
  let row=old&&JSON.stringify(old)===JSON.stringify(value)?old:value;
  if(structured.includes(field)&&protectedRow(old))row=old;
  if(field==='entities'&&old)row={...old,evidenceIds:[...new Set([...(old.evidenceIds||[]),...(row.evidenceIds||[])])]};
  map.set(row.id,row);
  if(++count%20===0)await setImmediate();
 }
 if(!articles)throw Error('invalid_snapshot');
 for(const field of structured)for(const [id,row] of maps.get(field))if(processed.has(row.documentId)&&!protectedRow(row)&&!seen.get(field).has(id))maps.get(field).delete(id);
 for(const [field,map] of maps)next[field]=[...map.values()];
 const mirrors=new Map(structured.map(field=>{const docs=new Map();for(const row of next[field]){if(!docs.has(row.documentId))docs.set(row.documentId,[]);docs.get(row.documentId).push(row);}return [field,docs];}));
 next.documents=next.documents.map(doc=>processed.has(doc.id)?{...doc,extraction:{...doc.extraction,...Object.fromEntries(structured.map(field=>[field,mirrors.get(field).get(doc.id)||[]]))}}:doc);
 return next;
}
