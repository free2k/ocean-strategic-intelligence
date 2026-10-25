// The existing marine daily brief runs independently of the active web profile.
import pg from 'pg';
import path from 'node:path';
import {cachedAudit,readAuditBody} from './classification-audit.mjs';
import {FileRuntimeState} from './research/runtime-state.mjs';
import {PeriodReports} from './research/period-reports.mjs';
import {createPeriodScheduler} from './research/period-scheduler.mjs';
import {configuredProvider} from './research/provider.mjs';
if(process.env.APP_ID==='low-carbon')throw Error('MARINE_SCHEDULE_PROFILE_REQUIRED');
const pool=new pg.Pool({connectionString:process.env.INTEL_AUDIT_DATABASE_URL||process.env.INTEL_DATABASE_URL||process.env.DATABASE_URL,max:2,connectionTimeoutMillis:5000});
try{
 const reports=new PeriodReports({state:new FileRuntimeState(path.join(process.env.INTEL_DATA_DIR,'period-reports')),audit:()=>cachedAudit(pool),readBody:d=>readAuditBody(pool,d),model:process.env.INTEL_ENABLE_AI==='true'&&process.env.OPENAI_API_KEY&&process.env.CHAT_MODEL&&process.env.OPENAI_BASE_URL?configuredProvider({apiKey:process.env.OPENAI_API_KEY,endpoint:process.env.OPENAI_BASE_URL}):null,modelName:process.env.CHAT_MODEL||''});
 if((await reports.list()).some(j=>['queued','running'].includes(j.status)&&String(j.requestId||'').startsWith('daily-weekly-')))await reports.recover({scheduledOnly:true});
 const schedule=createPeriodScheduler(reports,{enabled:true,startImmediately:false,interval:0,onError:error=>{console.error('daily-brief-failed',error.code||error.name);process.exitCode=1;}});
 await schedule.tick();await reports.running;schedule.stop();
}finally{await pool.end();}
