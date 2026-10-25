import pg from 'pg';
import {retryPlan,modelError} from './model-retry.mjs';

export const modelSchemaSql=`CREATE SCHEMA IF NOT EXISTS model_ops;
CREATE TABLE IF NOT EXISTS model_ops.requests(
 id text PRIMARY KEY,task text NOT NULL,model text NOT NULL,endpoint text NOT NULL,origin text NOT NULL DEFAULT '',
 body jsonb NOT NULL,status text NOT NULL,transport text NOT NULL DEFAULT 'realtime',attempts integer NOT NULL DEFAULT 0,
 response jsonb,error jsonb,batch_id text,retry_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS model_requests_pending ON model_ops.requests(status,created_at);
CREATE TABLE IF NOT EXISTS model_ops.batches(
 id text PRIMARY KEY,provider_id text,input_file_id text,status text NOT NULL,
 endpoint text NOT NULL,model text NOT NULL,origin text NOT NULL DEFAULT '',error jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS model_ops.resources(
 id text PRIMARY KEY,kind text NOT NULL,source_hash text NOT NULL,payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'queued',result jsonb,error jsonb,attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());`;

export class ModelRequestStore{
 constructor(pool){this.pool=pool;this.ready=null;}
 async init(){if(!this.ready)this.ready=this.pool.query(modelSchemaSql).catch(e=>{this.ready=null;throw e;});await this.ready;}
 async get(id){await this.init();return (await this.pool.query('SELECT * FROM model_ops.requests WHERE id=$1',[id])).rows[0];}
 async claim({id,task,model,endpoint,body,batch,origin=''}){
  await this.init();
  const added=await this.pool.query(`INSERT INTO model_ops.requests(id,task,model,endpoint,body,status,attempts,transport,origin)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING *`,[id,task,model,endpoint,body,batch?'queued':'running',batch?0:1,batch?'batch':'realtime',origin]);
  if(added.rows[0])return {record:added.rows[0],owned:true};
  if(!batch){const claimed=await this.pool.query(`UPDATE model_ops.requests SET status='running',attempts=attempts+1,updated_at=now()
   WHERE id=$1 AND status='retry' AND retry_at<=now() AND attempts<3 RETURNING *`,[id]);if(claimed.rows[0])return {record:claimed.rows[0],owned:true};}
  await this.pool.query("UPDATE model_ops.requests SET status='uncertain',error='{\"code\":\"PROCESS_INTERRUPTED\"}',updated_at=now() WHERE id=$1 AND status='running' AND updated_at<now()-interval '15 minutes'",[id]);
  return {record:await this.get(id),owned:false};
 }
 async complete(id,response){await this.pool.query("UPDATE model_ops.requests SET status='completed',response=$2,body='{}',error=NULL,retry_at=NULL,updated_at=now() WHERE id=$1",[id,response]);}
 async fail(id,error,{uncertain=false}={}){
  const record=await this.get(id);const plan=retryPlan(uncertain?modelError('MODEL_REQUEST_UNCERTAIN'):error,{attempts:Math.max(0,(record?.attempts||1)-1)});
  await this.pool.query("UPDATE model_ops.requests SET status=$2,error=$3,retry_at=$4,attempts=$5,updated_at=now() WHERE id=$1",[id,uncertain?'uncertain':['waiting','deferred'].includes(plan.status)?'retry':plan.status,plan.detail,plan.nextRetryAt,plan.attempts]);
  return plan;
 }
 async queueResource({id,kind,sourceHash,payload}){await this.init();await this.pool.query('INSERT INTO model_ops.resources(id,kind,source_hash,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[id,kind,sourceHash,payload]);return this.resourceStatus(id);}
 async resource(id){await this.init();return (await this.pool.query('SELECT id,kind,source_hash,status,result,error,attempts,created_at,updated_at FROM model_ops.resources WHERE id=$1',[id])).rows[0];}
 async resourceStatus(id){await this.init();return (await this.pool.query('SELECT id,kind,status,error,created_at,updated_at FROM model_ops.resources WHERE id=$1',[id])).rows[0];}
 async resumeRequest(id){await this.init();const row=await this.get(id);if(row?.status!=='paused')throw modelError('ONLY_PAUSED_REQUEST_CAN_RESUME');return (await this.pool.query("UPDATE model_ops.requests SET status=CASE WHEN transport='batch' THEN 'queued' ELSE 'retry' END,attempts=0,error=NULL,retry_at=now(),updated_at=now() WHERE id=$1 AND status='paused' RETURNING id,status",[id])).rows[0];}
 async resumeResource(id){await this.init();const row=await this.resource(id);if(row?.status!=='paused')throw modelError('ONLY_PAUSED_RESOURCE_CAN_RESUME');if(row.error?.receiptId){const receipt=await this.get(row.error.receiptId);if(receipt?.status==='uncertain')throw modelError('UNCERTAIN_RECEIPT_REQUIRES_RECONCILIATION');if(receipt?.status==='paused')await this.resumeRequest(receipt.id);}return (await this.pool.query("UPDATE model_ops.resources SET status='queued',attempts=0,error=NULL,updated_at=now() WHERE id=$1 AND status='paused' RETURNING id,status",[id])).rows[0];}
 async summary(){await this.init();return {requests:(await this.pool.query('SELECT task,model,status,count(*)::int count FROM model_ops.requests GROUP BY 1,2,3')).rows,resources:(await this.pool.query('SELECT kind,status,count(*)::int count FROM model_ops.resources GROUP BY 1,2')).rows};}
}
let shared;
export function modelStore(){return shared||=new ModelRequestStore(new pg.Pool({connectionString:process.env.INTEL_AUDIT_DATABASE_URL||process.env.DATABASE_URL||process.env.INTEL_DATABASE_URL||process.env.NUXT_DATABASE_URL,max:2,connectionTimeoutMillis:10000,allowExitOnIdle:true}));}
