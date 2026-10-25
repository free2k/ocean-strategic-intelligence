// Repeated immutable IDs and evidence quotes dominate the country overview.
// A lossless string table keeps the complete view while reducing its transfer.
const marker='\0';
export function packDashboard(value){
 const counts=new Map();const visit=v=>{if(typeof v==='string'){if(v.length>=48)counts.set(v,(counts.get(v)||0)+1);}else if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')Object.values(v).forEach(visit);};visit(value);
 const strings=[...counts].filter(([,n])=>n>1).map(([s])=>s),index=new Map(strings.map((s,i)=>[s,i]));
 const encode=v=>typeof v==='string'?(index.has(v)?marker+index.get(v):v.startsWith(marker)?marker+'!'+v:v):Array.isArray(v)?v.map(encode):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,v])=>[k,encode(v)])):v;
 return {encoding:'dashboard-strings-v1',strings,value:encode(value)};
}
export function unpackDashboard(packet){
 if(packet?.encoding!=='dashboard-strings-v1')return packet;
 if(!Array.isArray(packet.strings)||!packet.strings.every(s=>typeof s==='string'))throw Error('国别资料编码无效');
 const decode=v=>{if(typeof v==='string'&&v.startsWith(marker)){if(v[1]==='!')return v.slice(2);const key=v.slice(1);if(!/^(0|[1-9]\d*)$/.test(key)||!Object.hasOwn(packet.strings,key))throw Error('国别资料编码无效');return packet.strings[key];}return Array.isArray(v)?v.map(decode):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,v])=>[k,decode(v)])):v;};
 return decode(packet.value);
}
