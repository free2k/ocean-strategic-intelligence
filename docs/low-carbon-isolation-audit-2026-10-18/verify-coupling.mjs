// Audit only. No application entrypoint is imported; all extracted behavior
// runs with synthetic configuration and in-memory I/O implementations.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash, createHmac, timingSafeEqual, randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {fileURLToPath} from 'node:url';

const auditDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(auditDir,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const sourceRoots=['server','intelligence','scripts','deploy','pages','components','composables','middleware','layouts','utils','types','filter','app.vue','nuxt.config.ts','drizzle.config.ts','package.json','package-lock.json'];
const sourceFiles=execFileSync('git',['ls-files','-z','--',...sourceRoots],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean).sort();
const fingerprint=()=>Object.fromEntries(sourceFiles.map(p=>[p,hash(fs.readFileSync(path.join(root,p)))]));
const before=fingerprint();
const probes=[];
const sourceRefs=new Map();
function source(p,needle){
  const content=read(p),offset=content.indexOf(needle);
  assert.ok(offset>=0,'Source marker changed: '+p);
  const line=content.slice(0,offset).split('\n').length;
  sourceRefs.set(p+':'+line,{path:p,line,sha256:hash(content)});
  return content;
}
async function probe(id,name,fn){
  probes.push({id,name,scope:'existing reusable code, synthetic inputs',confirmedCoupling:true,observations:await fn()});
}

await probe('P01','Different database variables can select different databases',async()=>{
  const original={DATABASE_URL:'MOCK_ORIGINAL_DB',INTEL_DATABASE_URL:'MOCK_LOW_CARBON_DB',INTEL_AUDIT_DATABASE_URL:'MOCK_ORIGINAL_AUDIT_DB'};
  const run=source('intelligence/run.mjs','process.env.INTEL_DATABASE_URL ||=');
  const env={...original};
  vm.runInNewContext(run.split('\n').find(l=>l.includes('process.env.INTEL_DATABASE_URL ||=')),{process:{env}});
  function connection(p){
    const s=source(p,'connectionString:');
    const expression=s.match(/connectionString:([^,\n}]+)/)?.[1];
    assert.ok(expression);
    return vm.runInNewContext(expression,{process:{env}});
  }
  const targets={intelligence:env.INTEL_DATABASE_URL,mp2rssImport:connection('intelligence/import-mp2rss.mjs'),mp2rssStore:connection('server/integrations/mp2rss-store.mjs'),liveClassification:connection('intelligence/processing-live.mjs')};
  assert.equal(targets.intelligence,'MOCK_LOW_CARBON_DB');
  assert.equal(targets.mp2rssImport,'MOCK_ORIGINAL_DB');
  assert.equal(targets.mp2rssStore,'MOCK_ORIGINAL_DB');
  assert.equal(targets.liveClassification,'MOCK_ORIGINAL_AUDIT_DB');
  return {onlyChangingIntelDatabaseIsInsufficient:true,syntheticTargets:targets};
});

await probe('P02','A different path does not isolate root API requests',async()=>{
  source('intelligence/public/rule-editor.js',"fetch('/api/filters'");
  source('intelligence/public/sensing.js',"write('/api/subscriptions/action'");
  const page='https://same-host.example.invalid/low-carbon/workspace/';
  const paths=['/api/filters','/api/subscriptions/action','/api/rss/sources'];
  const resolved=paths.map(p=>new URL(p,page).href);
  assert.ok(resolved.every(u=>!new URL(u).pathname.startsWith('/low-carbon/')));
  return {sameHostPathIsolationFails:true,syntheticPage:page,resolved};
});

await probe('P03','The delivery worker calls the fixed original port',async()=>{
  const s=source('scripts/mp2rss-worker.mjs',"const base='http://127.0.0.1:3101'");
  const fragment=s.slice(s.indexOf('async function deliver(){'),s.indexOf('\ntry{'));
  assert.ok(fragment.startsWith('async function deliver(){'));
  const calls=[];
  const context={deliveryRevision:async()=>1,pool:{mock:true},process:{env:{MP2_TRIGGER_INTELLIGENCE:'true',SITE_PASSWORD:'SYNTHETIC_ONLY'}},AbortSignal:{timeout:()=>undefined},console:{log:()=>{}},fetch:async(url)=>{calls.push(url);return {ok:true,status:202,headers:{get:()=> 'SYNTHETIC_COOKIE'}};}};
  const deliver=vm.runInNewContext(fragment+'\ndeliver',context);
  await deliver();
  assert.deepEqual(calls,['http://127.0.0.1:3101/api/login','http://127.0.0.1:3101/api/process']);
  return {interceptedRequests:calls,realRequestsSent:0};
});

await probe('P04','The legacy authentication accepts a reused site cookie',async()=>{
  const s=source('intelligence/server.mjs','function auth(req)');
  const fragment=s.split('\n').find(l=>l.startsWith('function auth(req)'));
  assert.ok(fragment);
  const secret='SYNTHETIC_AUDIT_SECRET',expiry=String(Date.now()+60000);
  const token=expiry+'.'+createHmac('sha256',secret).update(expiry).digest('hex');
  const build=password=>vm.runInNewContext(fragment+'\nauth',{password,process:{env:{}},sign:v=>createHmac('sha256',password).update(v).digest('hex'),equal:(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);}});
  const reusedAccepted=build(secret)({headers:{cookie:'site_auth='+token}});
  const differentSecretAccepted=build('ANOTHER_SYNTHETIC_SECRET')({headers:{cookie:'site_auth='+token}});
  const lowCarbonCookieAccepted=build(secret)({headers:{cookie:'lc_site_auth='+token}});
  assert.equal(reusedAccepted,true);
  assert.equal(differentSecretAccepted,false);
  assert.equal(lowCarbonCookieAccepted,false);
  assert.ok(s.includes("'site_auth=; Path=/; Max-Age=0"));
  return {sharedSecretAndLegacyCookieAccepted:reusedAccepted,differentSecretAccepted,newCookieAcceptedByLegacyCode:lowCarbonCookieAccepted,legacyLogoutClearsRootSiteCookie:true,noTokensRecorded:true};
});

await probe('P05','Shared browser context reuses and clears the same draft keys',async()=>{
  const s=source('intelligence/public/strategy/state.js',"DRAFT_KEY='ocean-strategy-draft-v2'");
  const declaration=s.split('\n').find(l=>l.startsWith('export const DRAFT_KEY=')).replace('export ','');
  const save=s.split('\n').find(l=>l.startsWith('export function saveDraft')).replace('export ','');
  const clear=s.split('\n').find(l=>l.startsWith('export function clearDraft')).replace('export ','');
  const storage={};
  Object.defineProperties(storage,{getItem:{value:k=>storage[k]??null},setItem:{value:(k,v)=>{storage[k]=v;}},removeItem:{value:k=>{delete storage[k];}}});
  const api=vm.runInNewContext(declaration+'\n'+save+'\n'+clear+'\n({saveDraft,clearDraft,DRAFT_KEY})',{sessionStorage:storage});
  api.saveDraft({owner:'original-fixture'});
  api.saveDraft({owner:'low-carbon-fixture'});
  const overwritten=JSON.parse(storage[api.DRAFT_KEY]).owner==='low-carbon-fixture';
  storage['ocean-strategy-original-fixture']='one';
  storage['ocean-strategy-low-carbon-fixture']='two';
  storage.unrelated='preserved';
  api.clearDraft();
  assert.equal(overwritten,true);
  assert.deepEqual(Object.keys(storage),['unrelated']);
  return {condition:'same origin and same browser storage context',draftOverwritten:overwritten,legacyPrefixKeysAllRemoved:true,unrelatedKeyPreserved:true};
});

await probe('P06','Disabling the intel timer does not disable manual runs or the old lock',async()=>{
  const s=source('intelligence/scheduler.mjs',"'/opt/ocean-intelligence/eia-daily.lock'");
  const fragment=s.slice(s.indexOf('export async function createScheduler')).replace('export ','');
  const commands=[],memory=new Map();
  const mockFs={readFile:async()=>{throw Object.assign(Error('synthetic missing state'),{code:'ENOENT'});},writeFile:async(p,v)=>memory.set(p,v),rename:async(a,b)=>{memory.set(b,memory.get(a));memory.delete(a);}};
  const spawn=(command,args)=>{commands.push({command,lock:args[1]});const child=new EventEmitter();child.stdout=new EventEmitter();child.stdin={end:()=>{}};queueMicrotask(()=>child.emit('exit',1));return child;};
  const factory=vm.runInNewContext(fragment+'\ncreateScheduler',{fs:mockFs,path,spawn,randomUUID,process:{platform:'linux',execPath:'SYNTHETIC_NODE',env:{INTEL_SCHEDULE:'false'}},clearTimeout:()=>{},setTimeout:()=>{throw Error('unexpected real timer');}});
  const scheduler=await factory({store:{pool:null},dir:'/synthetic/low-carbon',root:'/synthetic/low-carbon/intelligence',serial:fn=>fn()});
  assert.equal(scheduler.status().enabled,false);
  const completed=await scheduler.run();
  assert.equal(completed,false);
  assert.equal(commands[0].command,'flock');
  assert.equal(commands[0].lock,'/opt/ocean-intelligence/eia-daily.lock');
  scheduler.close();
  return {simulatedPlatform:'linux',timerDisabled:true,manualRunAttempted:true,interceptedCommands:commands,realProcessesStarted:0,memoryWritesOnly:true};
});

await probe('P07','Store initialization issues writes before business requests',async()=>{
  const s=source('intelligence/store.mjs','async init(){');
  const tableDeclaration=s.split('\n').find(l=>l.startsWith('const tables='));
  assert.ok(tableDeclaration);
  const fragment=tableDeclaration+'\n'+s.slice(s.indexOf('export class Store')).replace('export ','');
  const statements=[],files=[];
  class Pool{async query(sql){statements.push(sql);if(sql.startsWith('SELECT payload FROM ocean_intel.runs'))return {rows:[{payload:{documents:[],series:[]}}]};if(sql.startsWith('SELECT id,version,config,scope'))return {rows:[{id:1,config:{rules:[]}}]};return {rows:[]};}}
  const Store=vm.runInNewContext(fragment+'\nStore',{pg:{Pool},path,fs:{mkdir:async p=>files.push({op:'mkdir',path:p}),writeFile:async p=>files.push({op:'write',path:p}),rename:async(a,b)=>files.push({op:'rename',from:a,to:b})},dataSchemaSql:[],loadDataEdits:async()=>({}),applyDataEdits:d=>d,attachPublishedRules:(d,j)=>{d.industryRuleConfig=j.config;d.industryRuleVersion='synthetic';d.industryRulePublication={synthetic:true};}});
  await new Store('/synthetic/low-carbon','SYNTHETIC_CONNECTION_ONLY').init();
  const create=statements.some(sql=>sql.startsWith('CREATE ')),update=statements.some(sql=>sql.startsWith('UPDATE ocean_intel.runs'));
  assert.equal(create,true);assert.equal(update,true);assert.ok(files.some(f=>f.op==='write'));
  return {executedOnStubs:{createStatements:create,metadataUpdate:update,snapshotWrite:true},realDatabaseConnections:0,realBusinessFilesWritten:0};
});

await probe('P08','The data adapter defaults to the original service',async()=>{
  const s=source('intelligence/workspace-data-server.mjs',"upstream='http://127.0.0.1:3101'");
  const fragment=s.slice(s.indexOf('export function createWorkspaceDataServer')).replace('export ','');
  const calls=[];
  const fetch=async url=>{calls.push(url);return {ok:true,status:200,headers:{get:()=> 'application/json'},body:{mock:true}};};
  const factory=vm.runInNewContext(fragment+'\ncreateWorkspaceDataServer',{http:{createServer:handler=>({handler})},fetch,URL,AbortController,AbortSignal:{timeout:()=>({}),any:()=>({})},Readable:{fromWeb:()=>({})},pipeline:async()=>{}});
  const server=factory();
  const res=new EventEmitter();res.setHeader=()=>{};res.writeHead=()=>{};res.writableFinished=false;
  await server.handler({url:'/api/data',method:'GET',headers:{}},res);
  assert.deepEqual(calls,['http://127.0.0.1:3101/api/data']);
  return {interceptedRequests:calls,realRequestsSent:0,noSocketOpened:true};
});

const staticChecks=[];
function staticCheck(id,name,p,needles){
  const content=source(p,needles[0]);
  for(const needle of needles)assert.ok(content.includes(needle),'Static evidence changed: '+p);
  staticChecks.push({id,name,path:p,confirmed:true,mode:'source inspection only; code not executed'});
}
staticCheck('S01','Recovery controls the original named process','intelligence/processing-recover.mjs',["execFileSync('pm2',['stop','ocean-intelligence']","execFileSync('pm2',['restart','ocean-intelligence']"]);
staticCheck('S02','Nuxt registers its own recurring scraper','server/plugins/scraper-scheduler.ts',['intervalId = setInterval(checkAndRun, 60 * 1000)','from(schema.scrapeSources)']);
staticCheck('S03','Unsubscribe modifies the remote provider collection','server/api/subscriptions/action.post.ts',["b.action==='unsubscribe'","client()('/open-api/subscriptions/'+s.remoteId,{method:'DELETE'})"]);
staticCheck('S04','Existing worker unit loads original environment and directory','deploy/mp2rss-sync.service',['WorkingDirectory=/opt/knowledge-base/mp2rss-current','--env-file=/opt/knowledge-base/.env']);
staticCheck('S05','Classification modifies original article, vector and provider tables','intelligence/processing-live.mjs',['UPDATE public.articles SET','DELETE FROM public.article_chunks','UPDATE mp2rss.items SET classification=']);

const after=fingerprint();
const changed=sourceFiles.filter(p=>before[p]!==after[p]);
assert.deepEqual(changed,[]);
const report={
  auditDate:'2026-10-18',
  codeRevision:git('rev-parse','HEAD'),
  scope:'Current repository coupling risks. This is not acceptance of an implemented low-carbon system.',
  verdict:{existingCodeHasCouplings:true,directCopyIsIsolationSafe:false,lowCarbonRuntimeIsolationVerified:false},
  safety:{applicationEntrypointsImported:0,realDatabaseConnections:0,realNetworkRequests:0,actualServiceControlCommands:0,businessFilesWritten:0,productionEnvironmentFilesRead:0},
  trackedRuntimeFilesFingerprinted:sourceFiles.length,
  sourceFingerprintBefore:hash(JSON.stringify(before)),
  sourceFingerprintAfter:hash(JSON.stringify(after)),
  changedRuntimeFiles:changed,
  behaviorProbeCount:probes.length,
  confirmedCouplingProbeCount:probes.filter(p=>p.confirmedCoupling).length,
  probes,
  staticEvidenceCheckCount:staticChecks.length,
  staticChecks,
  sourceReferences:[...sourceRefs.values()],
  notVerified:['Two deployed systems and database instances','Real provider account, budget, concurrency and egress isolation','Production host, proxy, storage and network separation','Operational rollback or failure against a running low-carbon instance']
};
const output=path.join(auditDir,'results.json');
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,verdict:report.verdict,behaviorProbeCount:report.behaviorProbeCount,confirmedCouplingProbeCount:report.confirmedCouplingProbeCount,trackedRuntimeFilesFingerprinted:sourceFiles.length,runtimeSourceUnchanged:changed.length===0,realDatabaseConnections:0,realNetworkRequests:0},null,2));
