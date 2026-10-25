const pendingCodes=new Set(['MODEL_BATCH_PENDING','MODEL_REQUEST_PENDING']);
const permanentCodes=/FreeTierOnly|Arrearage|Insufficient|Budget|InvalidApiKey|AccessDenied|QuotaExhausted/i;
export function safeModelError(error){
 const original=error?.cause||error;
 const status=Number(error?.status||original?.status)||null;
 const value=String(error?.code||original?.code||'');
 const providerCode=/^[A-Za-z0-9_.-]{1,120}$/.test(value)?value:null;
 const code=pendingCodes.has(value)||value==='BATCH_DEFERRED'||value==='MODEL_REQUEST_UNCERTAIN'?value:status?'http_'+status:/timeout|abort/i.test(String(error?.name))?'request_timeout':error instanceof SyntaxError?'invalid_json':'processing_error';
 return {code,httpStatus:status,...(providerCode?{providerCode}:{}),...(/^[a-f0-9]{64}$/.test(error?.receiptId||'')?{receiptId:error.receiptId}:{})};
}
export function retryPlan(error,{attempts=0,now=Date.now(),maxAttempts=3}={}){
 const detail=safeModelError(error),code=error?.code;
 if(pendingCodes.has(code))return {status:'waiting',attempts,nextRetryAt:new Date(now+5*60000).toISOString(),detail};
 if(code==='BATCH_DEFERRED')return {status:'deferred',attempts,nextRetryAt:new Date(now+3600000).toISOString(),detail};
 const count=attempts+1;
 const permanent=code==='MODEL_REQUEST_UNCERTAIN'||code==='MODEL_REQUEST_PAUSED'||[400,401,402,403,404].includes(detail.httpStatus)||permanentCodes.test(detail.providerCode||'');
 const paused=permanent||count>=maxAttempts;
 return {status:paused?'paused':'retry',attempts:count,nextRetryAt:paused?null:new Date(now+Math.min(24,2**Math.min(count-1,5))*3600000).toISOString(),detail};
}
export function modelError(code,status){return Object.assign(new Error(code),{code,...(status?{status}:{})});}
