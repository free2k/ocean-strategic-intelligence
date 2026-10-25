import OpenAI from 'openai';
import {modelStore} from '../intelligence/model-request-store.mjs';
import {drainBatches} from '../intelligence/model-batch-worker.mjs';
import {runResources} from '../intelligence/model-resources.mjs';
import {batchEnabled} from '../intelligence/model-policy.mjs';
import {safeModelError} from '../intelligence/model-retry.mjs';
const store=modelStore();
try{
 if(process.argv.includes('--init')){await store.init();console.log('Model operation schema initialized; no model request sent');}
 else if(process.argv.includes('--status'))console.log(JSON.stringify(await store.summary()));
 else{
  if(process.env.INTEL_ENABLE_AI!=='true'||!process.env.OPENAI_API_KEY)throw Error('AI_DISABLED');
  if(batchEnabled())try{
   if(!process.env.OPENAI_BATCH_BASE_URL)throw Error('BATCH_CONFIG_MISSING');
   const client=new OpenAI({apiKey:process.env.OPENAI_BATCH_API_KEY||process.env.OPENAI_API_KEY,baseURL:process.env.OPENAI_BATCH_BASE_URL,maxRetries:0,timeout:120000});
   console.log(JSON.stringify({batch:await drainBatches(store,client)}));
  }catch(error){console.error(JSON.stringify({component:'batch',...safeModelError(error)}));process.exitCode=1;}
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,baseURL:process.env.OPENAI_BASE_URL,maxRetries:0,timeout:180000});
  console.log(JSON.stringify({resources:await runResources(store,client)}));
 }
}catch(error){console.error(JSON.stringify({error:/^[A-Z_]+$/.test(error.message)?error.message:'MODEL_OPERATIONS_FAILED',code:error.code,status:error.status}));process.exitCode=1;}finally{await store.pool.end();}
