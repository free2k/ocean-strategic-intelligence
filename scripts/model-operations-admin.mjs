// Explicit operator recovery. Listing/recovering state never starts inference.
import OpenAI from 'openai';
import {modelStore} from '../intelligence/model-request-store.mjs';
const store=modelStore(),[action,id,providerId]=process.argv.slice(2);
try{
 await store.init();
 if(action==='--retry-request')console.log(JSON.stringify(await store.resumeRequest(id)));
 else if(action==='--retry-resource')console.log(JSON.stringify(await store.resumeResource(id)));
 else if(action==='--retry-semantic'){
  if(!/^\d+$/.test(id||''))throw Error('INVALID_ARTICLE_ID');
  const row=(await store.pool.query("SELECT article_id,receipt_id FROM classification.semantic_queue WHERE article_id=$1 AND status='paused'",[id])).rows[0];if(!row)throw Error('PAUSED_SEMANTIC_JOB_NOT_FOUND');
  if(row.receipt_id){const r=await store.get(row.receipt_id);if(r?.status==='uncertain')throw Error('UNCERTAIN_RECEIPT_REQUIRES_RECONCILIATION');if(r?.status==='paused')await store.resumeRequest(r.id);}
  await store.pool.query("UPDATE classification.semantic_queue SET status='pending',attempts=0,error=NULL,receipt_id=NULL,next_retry_at=now() WHERE article_id=$1 AND status='paused'",[id]);console.log(JSON.stringify({articleId:Number(id),status:'pending'}));
 }
 else if(action==='--retry-evidence'){
  const row=(await store.pool.query("SELECT payload FROM mp2rss.evidence_links WHERE url=$1 AND status='paused'",[id])).rows[0];if(!row)throw Error('PAUSED_EVIDENCE_JOB_NOT_FOUND');
  const receiptId=row.payload?.errorDetails?.receiptId;
  if(receiptId){const r=await store.get(receiptId);if(r?.status==='uncertain')throw Error('UNCERTAIN_RECEIPT_REQUIRES_RECONCILIATION');if(r?.status==='paused')await store.resumeRequest(r.id);}
  await store.pool.query("UPDATE mp2rss.evidence_links SET status='retry',payload=jsonb_set(payload,'{aiAttempts}','0'::jsonb)-'error'-'errorDetails',next_check=now(),updated_at=now() WHERE url=$1 AND status='paused'",[id]);console.log(JSON.stringify({status:'retry',count:1}));
 }
 else if(action==='--attach-batch'){
  if(!/^batch_[a-f0-9-]{36}$/.test(id||'')||!(/^[A-Za-z0-9_-]{1,120}$/.test(providerId||'')))throw Error('INVALID_BATCH_ID');
  const b=(await store.pool.query('SELECT * FROM model_ops.batches WHERE id=$1',[id])).rows[0];
  if(!b||b.status!=='uncertain'||b.origin!==process.env.OPENAI_BATCH_BASE_URL?.replace(/\/+$/,''))throw Error('BATCH_RECOVERY_CONFIG_MISMATCH');
  const client=new OpenAI({apiKey:process.env.OPENAI_BATCH_API_KEY||process.env.OPENAI_API_KEY,baseURL:process.env.OPENAI_BATCH_BASE_URL,maxRetries:0,timeout:30000});
  const remote=await client.batches.retrieve(providerId);
  if(remote.metadata?.request_group!==id||remote.input_file_id!==b.input_file_id)throw Error('PROVIDER_BATCH_DOES_NOT_MATCH');
  const guard=await store.pool.connect();let held=false;
  try{held=(await guard.query('SELECT pg_try_advisory_lock(73201941) locked')).rows[0].locked;if(!held)throw Error('BATCH_WORKER_BUSY');await guard.query('BEGIN');try{await guard.query("UPDATE model_ops.batches SET provider_id=$2,status='submitted',error=NULL,updated_at=now() WHERE id=$1 AND status='uncertain'",[id,providerId]);await guard.query("UPDATE model_ops.requests SET status='submitted',error=NULL,updated_at=now() WHERE batch_id=$1 AND status='uncertain'",[id]);await guard.query('COMMIT');}catch(e){await guard.query('ROLLBACK');throw e;}console.log(JSON.stringify({id,providerId,status:'attached_for_reconciliation'}));}finally{if(held)await guard.query('SELECT pg_advisory_unlock(73201941)');guard.release();}
 }else if(action==='--list-paused'){
  console.log(JSON.stringify({requests:(await store.pool.query("SELECT id,task,model,status,error,updated_at FROM model_ops.requests WHERE status IN ('paused','uncertain') ORDER BY updated_at DESC LIMIT 100")).rows,resources:(await store.pool.query("SELECT id,kind,status,error,updated_at FROM model_ops.resources WHERE status='paused' ORDER BY updated_at DESC LIMIT 100")).rows,batches:(await store.pool.query("SELECT id,provider_id,input_file_id,status,error FROM model_ops.batches WHERE status IN ('paused','uncertain') ORDER BY updated_at DESC LIMIT 100")).rows}));
 }else throw Error('UNKNOWN_MODEL_RECOVERY_ACTION');
}catch(error){console.error(JSON.stringify({error:/^[A-Z_]+$/.test(error.message)?error.message:'MODEL_RECOVERY_FAILED',code:error.code}));process.exitCode=1;}finally{await store.pool.end();}
