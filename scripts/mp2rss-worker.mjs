import {processSemanticQueue} from '../intelligence/semantic-classification.mjs';
import {needsDelivery,markDelivery,deliveryRevision,recordSemanticActivity} from '../intelligence/intelligence-delivery.mjs';
import {execute,pool} from '../server/integrations/mp2rss-store.mjs';
import {processXEvidence} from '../server/integrations/x-evidence-store.mjs';
const mode=process.argv[2]||'sync';
async function deliver(){
 if(!await deliveryRevision(pool)||process.env.MP2_TRIGGER_INTELLIGENCE!=='true')return;
 const base='http://127.0.0.1:3101';
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:process.env.SITE_PASSWORD}),signal:AbortSignal.timeout(10000)});
 if(!login.ok)throw Error('delivery_login_failed');
 const cookie=login.headers.get('set-cookie')?.split(';')[0];
 const response=await fetch(base+'/api/process',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});
 console.log(JSON.stringify({processingRequested:response.status===202,busy:response.status===409}));
}
try{
 if(mode==='semantic'){
  const startedAt=new Date().toISOString();await recordSemanticActivity(pool,{running:true,startedAt});
  try{const result=await processSemanticQueue(pool,{limit:6});console.log(JSON.stringify({semanticReview:result}));await recordSemanticActivity(pool,{running:false,startedAt,finishedAt:new Date().toISOString(),result});}
  catch(error){await recordSemanticActivity(pool,{running:false,startedAt,finishedAt:new Date().toISOString(),error:'语义复核失败，等待重试'});throw error;}
 }else if(mode==='evidence'){
  console.log(JSON.stringify({evidence:await processXEvidence({deadline:Date.now()+300000,limit:20})}));
 }else if(mode==='delivery')await deliver();
 else if(mode==='sync'){
  const result=await execute();console.log(JSON.stringify(result));
  if(needsDelivery(result))await markDelivery(pool);
  if(result.reclassification){await markDelivery(pool);await deliver();}
 }else throw Error('invalid_worker_mode');
}catch(error){console.error(JSON.stringify({mode,error:'worker_failed',type:error?.name||'Error',code:/^[A-Z0-9_]{1,40}$/.test(error?.code||'')?error.code:undefined}));process.exitCode=1;}finally{await pool.end();}
