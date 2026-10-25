import {parentPort,workerData} from 'node:worker_threads';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import {FileResearchRepository,PostgresResearchRepository} from './research/repositories.mjs';
import {MonitorData} from './monitor-data.mjs';
import {MonitorPageCache} from './monitor-page.mjs';
import {createMonitorPageReader} from './monitor-page-reader.mjs';
const {dir,scope,auth,port,databaseUrl,archive}=workerData;
// The shared launcher sends collection status pulses; this reader uses only
// immutable research publications and does not retain those messages.
parentPort.on('message',()=>{});
const pool=databaseUrl?new pg.Pool({connectionString:databaseUrl,max:2,connectionTimeoutMillis:5000,statement_timeout:60000,options:'-c default_transaction_read_only=on',application_name:'monitor-readonly'}):null;
const repository=pool?new PostgresResearchRepository(pool):new FileResearchRepository(archive||path.join(dir,'research-archive'));
let reportState=null,reportAt=0;async function reports(){if(reportState&&Date.now()-reportAt<1000)return reportState;let value;try{value=JSON.parse(await fs.readFile(path.join(dir,'period-reports/runtime.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;value={};}reportState=value.periodReports||{};reportAt=Date.now();return reportState;}
const data=new MonitorData(repository,{reports:{list:async()=>Object.values(await reports()).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30),get:async id=>(await reports())[id]}}),cache=new MonitorPageCache({data,dir,scope});
await cache.init();
const server=createMonitorPageReader({cache,auth});
server.listen(port,'127.0.0.1',()=>parentPort.postMessage({ready:true,port:server.address().port}));
