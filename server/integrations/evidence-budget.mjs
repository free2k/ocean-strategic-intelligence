export function remainingMs(deadline, maximum=120000){
 const left=Math.floor(deadline-Date.now());
 if(left<1000)throw Object.assign(new Error('batch_budget_exhausted'),{code:'BATCH_DEFERRED'});
 return Math.min(left,maximum);
}
export function errorDetails(error,stage){
 const status=Number(error?.status)||null;
 const known=['resource_too_large','unsafe_address','redirect_loop','too_many_redirects','translation_truncated','translation_empty','vision_truncated','network_error'];
 const code=error?.code==='BATCH_DEFERRED'?'batch_deferred':status?`http_${status}`:/timeout|abort/i.test(`${error?.name} ${error?.code}`)?'request_timeout':error instanceof SyntaxError?'invalid_json':known.includes(error?.message)?error.message:'processing_error';
 return {code,stage,httpStatus:status};
}
export function boundedClient(client,deadline,onStage=async()=>{}){
 return {chat:{completions:{create:async request=>{
  const timeout=remainingMs(deadline);await onStage('model');
  try{return await client.chat.completions.create(request,{timeout,signal:AbortSignal.timeout(timeout)});}
  catch(error){if(!error.status&&!error.code&&Date.now()>=deadline-1000)throw Object.assign(new Error('batch_budget_exhausted'),{code:'BATCH_DEFERRED',cause:error});throw error;}
 }}}};
}
export async function boundedLookup(operation,deadline){
 let timer;
 try{return await Promise.race([operation(),new Promise((_,reject)=>{
  timer=setTimeout(()=>reject(Object.assign(new Error('DNS lookup timed out'),{name:'TimeoutError'})),remainingMs(deadline,10000));
 })]);}finally{clearTimeout(timer);}
}
