// Split only storage representation. The logical record and its content ID stay unchanged.
export function splitRecord(record,{threshold=8*1024*1024,chunkBytes=1024*1024}={}){
 const root={...record},parts=[],fields={};
 for(const [field,value] of Object.entries(record)){
  if(!Array.isArray(value))continue;
  let rows=[],size=2,part=0,total=2;const chunks=[];
  for(const item of value){const bytes=Buffer.byteLength(JSON.stringify(item))+1;total+=bytes;if(rows.length&&size+bytes>chunkBytes){chunks.push(rows);rows=[];size=2;}rows.push(item);size+=bytes;}
  if(rows.length)chunks.push(rows);
  if(total<threshold)continue;
  delete root[field];fields[field]=value.length;
  for(const payload of chunks)parts.push({field,part:part++,payload});
 }
 if(parts.length)root._chunkedFields=fields;
 return {root,parts};
}
export async function hydrateRecord(root,readParts){
 if(!root?._chunkedFields)return root;
 const result={...root};delete result._chunkedFields;
 for(const [field,count] of Object.entries(root._chunkedFields)){
  const rows=await readParts(field);result[field]=rows.flatMap(r=>typeof r.payload==='string'?JSON.parse(r.payload):r.payload);
  if(result[field].length!==count)throw Object.assign(new Error('Incomplete immutable record chunks'),{code:'RECORD_PARTS_MISSING'});
 }
 return result;
}
