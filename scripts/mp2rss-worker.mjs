import {execute,pool} from '../server/integrations/mp2rss-store.mjs';
import {processXEvidence} from '../server/integrations/x-evidence-store.mjs';
try{
 const result=await execute();console.log(JSON.stringify(result));
 if(!result.busy&&!result.idle&&!result.discovery&&!result.reclassification){try{console.log(JSON.stringify({evidence:await processXEvidence()}));}catch(e){console.log(JSON.stringify({evidence:'deferred',code:/^[0-9A-Z]{5}$/.test(e.code||'')?e.code:'processing_error'}));}}
 if(!result.busy&&!result.idle&&!result.discovery&&(result.reclassification||process.env.MP2_TRIGGER_INTELLIGENCE==='true')){
  // Normal authenticated API; no forged sessions and no credentials printed.
  try{const base='http://127.0.0.1:3101';const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:process.env.SITE_PASSWORD})});
   if(!login.ok)throw Error();const cookie=login.headers.get('set-cookie')?.split(';')[0];const r=await fetch(base+'/api/process',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:'{}'});console.log(JSON.stringify({processingRequested:r.status===202,busy:r.status===409}));
  }catch{console.log('Intelligence processing deferred to next scheduled run');}
 }
}catch{console.error('Mp2RSS worker failed; inspect job status');process.exitCode=1;}finally{await pool.end();}
