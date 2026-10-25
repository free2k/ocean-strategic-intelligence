import {createHash} from 'node:crypto';
import {taskModel,batchEnabled,modelPolicyVersion} from './model-policy.mjs';
import {modelStore} from './model-request-store.mjs';
import {modelError} from './model-retry.mjs';

function ordered(value){if(Array.isArray(value))return value.map(ordered);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,ordered(value[k])]));return value;}
export const requestHash=value=>createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');
export function validateModelResponse(response,operation){
 if(operation==='embedding'){if(!Array.isArray(response?.data)||!response.data.length||response.data.some(d=>!Array.isArray(d.embedding)||!d.embedding.length||!d.embedding.every(Number.isFinite)))throw modelError('MODEL_INVALID_RESPONSE');return;}
 const choice=response?.choices?.[0];if(!choice||choice.finish_reason==='length'||!choice.message?.content)throw modelError('MODEL_INVALID_RESPONSE');
}
export function taskClient(client,{task,automatic=false,store,env=process.env,baseURL=client.baseURL||env.OPENAI_BASE_URL||''}={}){
 async function invoke(operation,request,options){
  if(request.stream)return client.chat.completions.create(request,options);
  const vision=request.messages?.some(m=>Array.isArray(m.content)&&m.content.some(p=>p.type==='image_url'));
  const kind=vision?'vision':operation==='embedding'?'embedding':task;
  const body={...request,model:request.model||taskModel(task,{env})};
  if(operation!=='embedding'&&/^qwen/.test(body.model))body.enable_thinking=false;
  const batch=automatic&&batchEnabled(env);
  // Separate endpoints have independent permissions and accounting. Never move
  // requests to a public endpoint just because a workspace endpoint rejected one.
  if(batch&&!env.OPENAI_BATCH_BASE_URL)throw modelError('BATCH_CONFIG_MISSING');
  const origin=(batch?env.OPENAI_BATCH_BASE_URL:baseURL).replace(/\/+$/,'');
  const endpoint=operation==='embedding'?'/v1/embeddings':'/v1/chat/completions';
  const id=requestHash({origin,endpoint,body,policy:modelPolicyVersion});
  const db=store||modelStore();const {record,owned}=await db.claim({id,task:kind,model:body.model,endpoint,body,batch,origin});
  const failure=(code,status)=>Object.assign(modelError(code,status),{receiptId:id});
  if(record.status==='completed')return record.response;
  if(['uncertain','submitting'].includes(record.status))throw failure('MODEL_REQUEST_UNCERTAIN');
  if(record.status==='paused')throw failure('MODEL_REQUEST_PAUSED',record.error?.httpStatus);
  if(batch||!owned)throw failure(batch?'MODEL_BATCH_PENDING':'MODEL_REQUEST_PENDING');
  let received=false;
  try{
   const response=await (operation==='embedding'?client.embeddings.create(body,options):client.chat.completions.create(body,options));
   received=true;
   validateModelResponse(response,operation);
   if(body.response_format?.type==='json_object')JSON.parse(response.choices[0].message.content);
   await db.complete(id,response);return response;
  }catch(error){
   // A timeout/connection loss can occur after the provider charged the request.
   // Preserve the uncertain receipt; it must be reconciled rather than resent.
   const cause=error.cause||error;
   const uncertain=received||!error.status&&(/timeout|abort|connection/i.test(String(error.name)+' '+String(cause.name))||['ETIMEDOUT','ECONNRESET'].includes(error.code));
   await db.fail(id,error,{uncertain});if(uncertain)throw failure('MODEL_REQUEST_UNCERTAIN');throw Object.assign(error,{receiptId:id});
  }
 }
 return {chat:{completions:{create:(r,o)=>invoke('chat',r,o)}},embeddings:{create:(r,o)=>invoke('embedding',r,o)}};
}
