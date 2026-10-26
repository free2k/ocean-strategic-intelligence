// Each mount receives its own copy; form and chart controls may mutate it.
const saved=new Map(),pending=new Map();let epoch=0;
export function clearWorkspaceReads(){epoch++;saved.clear();pending.clear();}
export async function readWorkspacePage(url,{signal,force=false}={}){
 const [path,query='']=url.split('?'),params=new URLSearchParams(query);for(const [k,v]of [...params])if(!v)params.delete(k);params.sort();const key=path+'?'+params,old=saved.get(key);
 if(force){epoch++;const previous=pending.get(key);if(previous)await previous.catch(()=>{});}
 const copy=value=>JSON.parse(value.text);
 if(!force&&old&&Date.now()-old.at<30000)return copy(old);
 const read=()=>{if(pending.has(key))return pending.get(key);const ticket=epoch,p=new URLSearchParams(params);if(force)p.set('refresh','1');const task=(async()=>{const r=await fetch(path+'?'+p,{headers:old&&!force?{'If-None-Match':old.etag}:undefined});if(r.status===304&&old){old.at=Date.now();return old;}const text=await r.text();let value;try{value=JSON.parse(text);}catch{throw Error('资料读取失败，请重试');}if(!r.ok){if(r.status===401)clearWorkspaceReads();throw Object.assign(Error(value.error||value.message||'资料读取失败'),{status:r.status});}const record={text,etag:r.headers.get('etag'),at:Date.now()};if(ticket===epoch){if(saved.size>=12)saved.delete(saved.keys().next().value);saved.set(key,record);}return record;})();pending.set(key,task);task.finally(()=>{if(pending.get(key)===task)pending.delete(key);}).catch(()=>{});return task;};
 if(!force&&old){void read().catch(()=>{});return copy(old);}const value=copy(await read());if(signal?.aborted)throw new DOMException('读取已取消','AbortError');return value;
}
