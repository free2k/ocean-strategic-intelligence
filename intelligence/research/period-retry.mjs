// Retry only transient reads or lock acquisition that failed before a state change.
const transient=new Set(['SHARED_STATE_BUSY','ECONNRESET','ECONNREFUSED','ETIMEDOUT','EPIPE','EAI_AGAIN','53300','53400','57P01','57P02','57P03','57014','40001','40P01']);
export const reportErrorCode=e=>String(e?.code||e?.name||'UNKNOWN_ERROR').replace(/[^a-zA-Z0-9_]/g,'').slice(0,64)||'UNKNOWN_ERROR';
export async function retryReportRead(operation,{stage='读取资料',documentId,attempts=4,lockOnly=false,wait=ms=>new Promise(r=>setTimeout(r,ms)),onError=()=>{}}={}){
 for(let attempt=1;attempt<=attempts;attempt++){
  try{return await operation();}catch(error){
   const code=reportErrorCode(error),retryable=lockOnly?code==='SHARED_STATE_BUSY':transient.has(code)||/^08[0-9A-Z]{3}$/.test(code);
   const detail={stage,documentId,code,attempt,maximumAttempts:attempts,retryable,at:new Date().toISOString()};
   onError({...detail,stackFrames:String(error?.stack||'').split('\n').slice(1,7)});
   if(!retryable||attempt===attempts){error.reportFailure=detail;throw error;}
   await wait(150*2**(attempt-1));
  }
 }
}
