// Keep only private, versioned read responses. Parse a fresh copy for each mount
// because chart controls update their own selected cohorts and view state.
const responses=new Map(),budget=64*1024*1024;let bytes=0;
export function clearCatalogReads(){responses.clear();bytes=0;}
export async function readCatalog(url,{signal,force=false}={}){
 const [path,query='']=url.split('?'),params=new URLSearchParams(Object.entries(Object.fromEntries(new URLSearchParams(query))).filter(([,v])=>v));params.sort();
 const key=path+(params.size?'?'+params:'');let cached=force?null:responses.get(key);
 const response=await fetch(key,{signal,headers:cached?.etag?{'If-None-Match':cached.etag}:undefined});
 if(response.status===304&&cached)return JSON.parse(cached.text);
 const text=await response.text();let value;try{value=JSON.parse(text);}catch{throw Error('读取失败，请点击刷新重试');}
 if(!response.ok){if(response.status===401)clearCatalogReads();throw Error(value.error||'读取失败，请点击刷新重试');}
 const etag=response.headers.get('etag'),size=text.length*2;
 if(etag&&size<=budget){
  const previous=responses.get(key);if(previous){bytes-=previous.size;responses.delete(key);}
  while(responses.size&&(bytes+size>budget||responses.size>=2)){const oldest=responses.keys().next().value;bytes-=responses.get(oldest).size;responses.delete(oldest);}
  responses.set(key,{etag,text,size});bytes+=size;
 }
 return value;
}
