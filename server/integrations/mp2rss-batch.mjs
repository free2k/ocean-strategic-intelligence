import {verifyWechat} from './wechat-identity.mjs';
import {verifyWithHistory} from './wechat-history.mjs';
const nameKey=s=>String(s||'').normalize('NFKC').trim().toLowerCase();
export function articleURL(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='mp.weixin.qq.com'||u.username||u.password||u.port||!/^\/s(?:\/|$)/.test(u.pathname))return null;u.hash='';return u.href;}catch{return null;}}
export function planImport(text,subscriptions){
 if(typeof text!=='string'||text.length>100000)throw Error('请导入不超过100KB的文本');
 const seen=new Set();return text.replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map((line,index)=>{
  const found=line.match(/https?:\/\/\S+/)?.[0],url=found?articleURL(found):null,name=(found?line.replace(found,'').replace(/[\t,，|]+$/,'').trim():line),key=url||nameKey(name),existing=subscriptions.filter(s=>s.present&&s.payload.platform==='mp'&&nameKey(s.payload.name)===nameKey(name));
  const status=seen.has(key)?'duplicate':found&&!url?'invalid':existing.length===1?'existing':existing.length>1?'ambiguous':url?'ready':'needs_link';seen.add(key);
  return {line:index+1,name,url,status,id:existing.length===1?existing[0].id:null};
 });
}
export async function enqueueBatch(pool,action,entries){
 if(!['batch_subscribe','batch_unsubscribe','batch_sync'].includes(action)||!Array.isArray(entries)||!entries.length||entries.length>200)throw Error('请选择1至200个订阅');
 const request=action==='batch_subscribe'?[...new Set(entries.map(x=>articleURL(x)).filter(Boolean))]:[...new Set(entries.map(String))];
 if(request.length!==new Set(entries).size)throw Error('批量参数无效');
 if(action!=='batch_subscribe'){const rows=(await pool.query('SELECT id,payload FROM mp2rss.subscriptions WHERE present AND id=ANY($1::text[])',[request])).rows;if(rows.length!==request.length||action==='batch_unsubscribe'&&rows.some(x=>x.payload.platform!=='mp'))throw Error('请选择有效公众号；X退订请到供应商控制台');}
 const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(73201911)');const existing=(await c.query("SELECT id FROM mp2rss.jobs WHERE action=$1 AND request=$2::jsonb AND status IN ('queued','running') LIMIT 1",[action,JSON.stringify(request)])).rows[0];const row=existing||(await c.query('INSERT INTO mp2rss.jobs(action,request) VALUES($1,$2) RETURNING id',[action,JSON.stringify(request)])).rows[0];await c.query('COMMIT');return row;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function runBatch(job,pool,api,wait=ms=>new Promise(r=>setTimeout(r,ms)),verify=(n,u)=>verifyWithHistory(pool,n,u)){
 const rows=job.result?.batch||job.request.map(value=>({value:typeof value==='string'?value:value.url,expected:typeof value==='string'?null:value,status:'queued'}));
 const save=()=>pool.query("UPDATE mp2rss.jobs SET result=jsonb_set(coalesce(result,'{}'::jsonb),'{batch}',$2::jsonb) WHERE id=$1",[job.id,JSON.stringify(rows)]);
 for(const row of rows){if(row.status==='running'){row.status='uncertain';row.error='上次请求中断，请刷新远端订阅核对后再提交';await save();continue;}if(row.status!=='queued')continue;
  row.status='running';await save();try{
   if(job.action==='batch_verified_subscribe'){const proof=await verify(row.expected.name,row.value);if(proof.status!=='verified'||proof.biz!==row.expected.biz){row.verification=proof;throw Object.assign(Error('订阅前再次核验未通过，未添加订阅'),{identityFailed:true});}row.verification=proof;}
   if(['batch_subscribe','batch_verified_subscribe'].includes(job.action))await api('/open-api/subscriptions',{method:'POST',body:{articleUrl:row.value}});
   else {const s=(await pool.query('SELECT payload,present FROM mp2rss.subscriptions WHERE id=$1',[row.value])).rows[0];if(!s?.present)throw Error('订阅已取消');await api('/open-api/subscriptions/'+s.payload.remoteId,{method:'DELETE'});}
   row.status='completed';
  }catch(e){row.status='failed';row.error=e.identityFailed||e.name==='ProviderError'?e.message:'操作未完成，请刷新远端订阅核对';}
  await save();await wait(1500);
 }return rows;
}
