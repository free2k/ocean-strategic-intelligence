import {randomUUID} from 'node:crypto';
import {toFile} from 'openai';
import {safeModelError,modelError} from './model-retry.mjs';
import {validateModelResponse} from './model-client.mjs';

// A single locked worker submits and reconciles durable receipts. A provider
// timeout is never converted into a new realtime request or an automatic resend.
export async function drainBatches(store,client,{limit=50,maxBytes=4*1024*1024,deadline=Date.now()+4*60000}={}){
 await store.init();const guard=await store.pool.connect();let locked=false;
 const result={submitted:0,completed:0,paused:0,uncertain:0};
 try{
  locked=(await guard.query('SELECT pg_try_advisory_lock(73201941) locked')).rows[0].locked;if(!locked)return {busy:true};
  await guard.query("UPDATE model_ops.requests SET status='uncertain',error='{\"code\":\"PROCESS_INTERRUPTED\"}' WHERE status='running' AND updated_at<now()-interval '15 minutes'");
  // A crash between submit and receipt persistence requires explicit recovery.
  await guard.query("UPDATE model_ops.requests SET status='uncertain',error='{\"code\":\"BATCH_SUBMISSION_UNKNOWN\"}' WHERE status='submitting' AND batch_id IN (SELECT id FROM model_ops.batches WHERE status='submitting')");
  await guard.query("UPDATE model_ops.batches SET status='uncertain' WHERE status='submitting'");
  const origin=String(client.baseURL).replace(/\/+$/,'');
  const batches=(await guard.query("SELECT * FROM model_ops.batches WHERE status='submitted' AND origin=$1 ORDER BY created_at LIMIT 10",[origin])).rows;
  for(const b of batches){
   if(Date.now()>deadline-120000)break;
   let remote;try{remote=await client.batches.retrieve(b.provider_id);}catch(error){if([401,403].includes(error.status))throw error;continue;}
   if(!['completed','failed','expired','cancelled'].includes(remote.status))continue;
   const expected=(await guard.query('SELECT * FROM model_ops.requests WHERE batch_id=$1 AND status=\'submitted\'',[b.id])).rows;
   const found=new Set();
   for(const file of [remote.output_file_id,remote.error_file_id].filter(Boolean)){
    const text=await (await client.files.content(file)).text();
    for(const line of text.split('\n').filter(Boolean)){
     let row;try{row=JSON.parse(line);}catch{throw modelError('BATCH_RESULT_INVALID');}
     const request=expected.find(r=>r.id===row.custom_id);if(!request||found.has(request.id))continue;found.add(request.id);
     if(row.response?.status_code===200){
      try{validateModelResponse(row.response.body,request.endpoint.endsWith('/embeddings')?'embedding':'chat');if(request.body.response_format?.type==='json_object')JSON.parse(row.response.body.choices[0].message.content);await store.complete(request.id,row.response.body);result.completed++;}
      // A 200 response already ran at the provider. Invalid output must not
      // silently create another paid request on the next worker pass.
      catch(error){await store.fail(request.id,error,{uncertain:true});result.uncertain++;}
     }else{
      const status=Number(row.response?.status_code)||400;await store.fail(request.id,{status,code:row.error?.code||'BATCH_ROW_FAILED'});result.paused++;
     }
    }
   }
   for(const r of expected)if(!found.has(r.id)){
    await guard.query("UPDATE model_ops.requests SET status='uncertain',error=$2,updated_at=now() WHERE id=$1",[r.id,{code:'BATCH_RESULT_MISSING',providerStatus:remote.status}]);result.uncertain++;
   }
   await guard.query("UPDATE model_ops.batches SET status=$2,updated_at=now() WHERE id=$1",[b.id,remote.status]);
  }
  await guard.query("UPDATE model_ops.requests SET status='queued' WHERE transport='batch' AND status='retry' AND retry_at<=now() AND attempts<3");
  if(Date.now()>deadline-120000)return result;
  const waiting=(await guard.query("SELECT * FROM model_ops.requests WHERE transport='batch' AND status='queued' AND origin=$2 ORDER BY created_at LIMIT $1",[limit,origin])).rows;
  if(!waiting.length)return result;
  const first=waiting[0],rows=[];let bytes=0;
  for(const r of waiting.filter(r=>r.model===first.model&&r.endpoint===first.endpoint)){
   const line=JSON.stringify({custom_id:r.id,method:'POST',url:r.endpoint,body:r.body});const size=Buffer.byteLength(line)+1;
   if(size>maxBytes){await guard.query("UPDATE model_ops.requests SET status='paused',error='{\"code\":\"BATCH_REQUEST_TOO_LARGE\"}' WHERE id=$1",[r.id]);continue;}
   if(bytes+size>maxBytes)break;bytes+=size;rows.push({r,line});
  }
  if(!rows.length)return result;
  const id='batch_'+randomUUID();
  await guard.query('BEGIN');
  try{await guard.query("INSERT INTO model_ops.batches(id,status,endpoint,model,origin) VALUES($1,'submitting',$2,$3,$4)",[id,first.endpoint,first.model,origin]);await guard.query("UPDATE model_ops.requests SET status='submitting',batch_id=$2,attempts=attempts+1,updated_at=now() WHERE id=ANY($1::text[])",[rows.map(x=>x.r.id),id]);await guard.query('COMMIT');}catch(e){await guard.query('ROLLBACK');throw e;}
  let file,submitted=false;
  try{
   file=await client.files.create({file:await toFile(Buffer.from(rows.map(x=>x.line).join('\n')+'\n'),'model-requests.jsonl'),purpose:'batch'});
   await guard.query('UPDATE model_ops.batches SET input_file_id=$2 WHERE id=$1',[id,file.id]);
   submitted=true;const remote=await client.batches.create({input_file_id:file.id,endpoint:first.endpoint,completion_window:'24h',metadata:{ds_name:'knowledge-base '+id,request_group:id}});
   await guard.query('BEGIN');
   try{await guard.query("UPDATE model_ops.batches SET provider_id=$2,status='submitted',updated_at=now() WHERE id=$1",[id,remote.id]);await guard.query("UPDATE model_ops.requests SET status='submitted',updated_at=now() WHERE batch_id=$1",[id]);await guard.query('COMMIT');}catch(e){await guard.query('ROLLBACK');throw e;}
   result.submitted=rows.length;
  }catch(error){
   const uncertain=submitted&&(!error.status||error.status>=500||error.status===408);
   await guard.query("UPDATE model_ops.batches SET status=$2,error=$3,updated_at=now() WHERE id=$1",[id,uncertain?'uncertain':'paused',safeModelError(error)]);
   await guard.query("UPDATE model_ops.requests SET status=$2,error=$3,updated_at=now() WHERE batch_id=$1",[id,uncertain?'uncertain':'paused',safeModelError(error)]);
   result[uncertain?'uncertain':'paused']+=rows.length;
  }
  return result;
 }finally{if(locked)await guard.query('SELECT pg_advisory_unlock(73201941)');guard.release();}
}
