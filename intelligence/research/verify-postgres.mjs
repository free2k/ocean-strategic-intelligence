// Explicit isolated validation only; refuses a database without the test prefix.
import pg from 'pg';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PostgresResearchRepository} from './repositories.mjs';
import {PostgresRuntimeState} from './runtime-state.mjs';
import {digest,ResearchLedger} from './ledger.mjs';
const url=process.env.RESEARCH_TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.startsWith('/ocean_validation_'))throw Error('An explicitly isolated ocean_validation_ database is required');
const pool=new pg.Pool({connectionString:url,max:24}),repo=new PostgresResearchRepository(pool),report={startedAt:new Date().toISOString(),checks:[],benchmarks:[]};
try{
 const exists=await pool.query("SELECT to_regclass('ocean_research.records') AS value");assert.equal(exists.rows[0].value,null,'Use a fresh isolated database');
 for(const file of (await fs.readdir(new URL('./migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await pool.query(await fs.readFile(new URL('./migrations/'+file,import.meta.url),'utf8'));
 report.checks.push('all additive migrations applied to empty PostgreSQL');
 const make=(n,previousReleaseId=null)=>{const snapshotId='snapshot_'+digest({n}),snapshot={kind:'snapshot',entries:[],marker:n},release={kind:'release',snapshotId,previousReleaseId,publishedAt:new Date().toISOString(),marker:n};const releaseId='release_'+digest(release);release.releaseId=releaseId;return {head:{releaseId,snapshotId},records:{[snapshotId]:snapshot,[releaseId]:release}};};
 const base=make(0);await repo.commit({expectedReleaseId:null,...base});
 const outcomes=await Promise.allSettled(Array.from({length:20},(_,i)=>repo.commit({expectedReleaseId:base.head.releaseId,...make(i+1,base.head.releaseId)})));
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert(outcomes.filter(r=>r.status==='rejected').every(r=>r.reason.code==='VERSION_CONFLICT'));report.checks.push('20 concurrent publishers: exactly one winner, 19 explicit version conflicts');
 const savedHead=await repo.head(),before=await pool.query('SELECT count(*)::int AS n FROM ocean_research.records');
 const bad=make(100,savedHead.releaseId);bad.records['product_'+digest('invalid')]={kind:'not_allowed'};
 await assert.rejects(()=>repo.commit({expectedReleaseId:savedHead.releaseId,...bad}));assert.deepEqual(await repo.head(),savedHead);assert.equal((await pool.query('SELECT count(*)::int AS n FROM ocean_research.records')).rows[0].n,before.rows[0].n);report.checks.push('injected insert failure rolls back all records and head');
 const runtime=new PostgresRuntimeState(pool);await Promise.all(Array.from({length:20},()=>runtime.transact(state=>{state.counter=(state.counter||0)+1;})));assert.equal(await runtime.transact(state=>state.counter),20);report.checks.push('20 concurrent runtime updates retained without lost increments');
 await repo.commit({expectedReleaseId:savedHead.releaseId,head:base.head,records:{}});assert.equal(await repo.isPublished(savedHead.releaseId),false);assert.equal(await repo.releaseForSnapshot(savedHead.snapshotId),null);await assert.rejects(()=>new ResearchLedger(repo).release(savedHead.releaseId),{code:'VERSION_NOT_FOUND'});
 assert(await repo.read(savedHead.releaseId));await repo.commit({expectedReleaseId:base.head.releaseId,head:savedHead,records:{}});report.checks.push('rollback hides withdrawn release while retaining immutable records; forward restoration succeeds');
 // Synthetic storage benchmark, clearly separate from real library backfill.
 for(const count of [10000,100000]){
  const t=performance.now();await pool.query(`INSERT INTO ocean_research.records(id,kind,payload) SELECT 'product_'||lpad(to_hex(n),64,'0'),'product',jsonb_build_object('kind','product','fixture',true,'index',n,'body',repeat('evidence ',128)) FROM generate_series($1::int,$2::int) AS n ON CONFLICT DO NOTHING`,[count===10000?1:10001,count]);
  const latencies=await Promise.all(Array.from({length:20},async(_,i)=>{const start=performance.now();for(let j=0;j<10;j++)await repo.read('product_'+(1+((i*997+j*101)%count)).toString(16).padStart(64,'0'));return (performance.now()-start)/10;}));latencies.sort((a,b)=>a-b);
  report.benchmarks.push({syntheticRecords:count,insertMs:Math.round(performance.now()-t),readers:20,readsPerReader:10,meanReadMs:Math.round(latencies.reduce((a,b)=>a+b)/20*100)/100,p95ReaderMeanMs:Math.round(latencies[18]*100)/100,scope:'indexed immutable single-record reads; not full-snapshot API load or cold-cache guarantee'});
 }
 report.passed=true;
}finally{await pool.end();report.finishedAt=new Date().toISOString();await fs.mkdir('.data',{recursive:true});await fs.writeFile('.data/postgres-validation-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
