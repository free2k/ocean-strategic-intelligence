import {fileURLToPath} from 'node:url';
import {createDashboardAssets} from './dashboard-assets.mjs';
import {parentPort,workerData} from 'node:worker_threads';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import {FileResearchRepository,PostgresResearchRepository} from './research/repositories.mjs';
import {DashboardData} from './dashboard-data.mjs';
import {DashboardPageCache} from './dashboard-page.mjs';
import {createDashboardPageReader} from './dashboard-page-reader.mjs';
const {dir,scope,auth,port,databaseUrl,archive}=workerData;
// The shared launcher sends collection status pulses; this reader uses only
// immutable research publications and does not retain those messages.
parentPort.on('message',()=>{});
const pool=databaseUrl?new pg.Pool({connectionString:databaseUrl,max:2,connectionTimeoutMillis:5000,statement_timeout:60000,options:'-c default_transaction_read_only=on',application_name:'dashboard-readonly'}):null;
const repository=pool?new PostgresResearchRepository(pool):new FileResearchRepository(archive||path.join(dir,'research-archive'));
const data=new DashboardData(repository),cache=new DashboardPageCache({data,dir,scope});
await cache.init();
const world=JSON.parse(await fs.readFile(new URL('./public/world.json',import.meta.url),'utf8'));
const {brandText}=process.env.APP_ID==='low-carbon'?await import('./system-profile.mjs'):{brandText:text=>text};
const assets=createDashboardAssets(fileURLToPath(new URL('./',import.meta.url)),{brandText});
const server=createDashboardPageReader({cache,auth,world,assets});
server.listen(port,'127.0.0.1',()=>parentPort.postMessage({ready:true,port:server.address().port}));
