import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import {verifyLowCarbonEnvironment} from './runtime.mjs';
import {assertNoPaidConfiguration} from './shared-mode.mjs';
import {SharedSource} from './shared-source.mjs';
import {projectionSchema,updateProjection} from './shared-projection.mjs';
import {Store} from '../store.mjs';
assertNoPaidConfiguration();await verifyLowCarbonEnvironment();
const control=new pg.Pool({connectionString:process.env.INTEL_DATABASE_URL,max:1});
const guard=await control.connect();let source,store,locked=false;
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{setTimeout(()=>process.exit(0),5000).unref();});
try{
 const status=(await guard.query("SELECT payload FROM lc_shared.state WHERE id='status'")).rows[0]?.payload||{};
 const request=(await guard.query("SELECT payload FROM lc_shared.state WHERE id='request'")).rows[0]?.payload?.requestId;
 const handled=(await guard.query("SELECT payload FROM lc_shared.state WHERE id='handled-request'")).rows[0]?.payload?.requestId;
 const due=status.running||!status.nextRun||Date.parse(status.nextRun)<=Date.now()||request&&request!==handled;
 if(due){
  locked=(await guard.query('SELECT pg_try_advisory_lock(73201943) locked')).rows[0].locked;
  if(locked){
   source=new SharedSource();await source.verify();
   const cacheFile=path.join(process.env.LC_LOCK_DIR,'shared-source-headers.json');
   try{const headers=JSON.parse(await fs.readFile(cacheFile,'utf8'));if(Array.isArray(headers))source.intelHeaders=new Map(headers.filter(r=>r.id&&r.url&&r.revision).map(r=>[r.id,r]));}catch{}
   const index=source.index.bind(source);source.index=async()=>{const value=await index();await fs.writeFile(cacheFile+'.tmp',JSON.stringify([...source.intelHeaders.values()]),{mode:0o600});await fs.rename(cacheFile+'.tmp',cacheFile);return value;};
   store=new Store(process.env.INTEL_DATA_DIR,process.env.INTEL_DATABASE_URL);await store.init();await store.pool.query(projectionSchema);
   await guard.query("UPDATE classification.jobs SET status='failed',error='上次本地处理未完成，继续复用已准备资料',finished_at=now() WHERE status IN ('processing','classifying') AND scope->>'trigger'='shared-local-projection'");
   await guard.query("INSERT INTO lc_shared.state(id,payload) VALUES('status',$1) ON CONFLICT(id) DO UPDATE SET payload=lc_shared.state.payload||EXCLUDED.payload,updated_at=now()",[{enabled:true,running:true,result:'running',error:null,mode:'shared',startedAt:new Date().toISOString(),modelCalls:0}]);
   const result=await updateProjection({source,store});
   await guard.query("INSERT INTO lc_shared.state(id,payload) VALUES('handled-request',$1) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()",[{requestId:request||null}]);
   console.log('shared-projection',JSON.stringify(result));
  }
 }
}catch(error){
 console.error('shared-projection-failed',error.code||error.name);
 await guard.query("UPDATE lc_shared.state SET payload=payload||$1::jsonb,updated_at=now() WHERE id='status'",[{running:false,result:'failed',nextRun:new Date(Date.now()+60000).toISOString(),error:'共享资料更新暂未完成，已保存结果保留；稍后本地重试，不调用模型。'}]);
 process.exitCode=1;
}finally{
 if(locked)await guard.query('SELECT pg_advisory_unlock(73201943)');
 guard.release();await control.end();await source?.close();await store?.pool.end();
}
