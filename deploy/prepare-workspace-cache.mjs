// Prepare private read caches before publishing a research frontend update.
// Example: node --env-file=/opt/knowledge-base/.env prepare-workspace-cache.mjs
//   --system=ocean --root=/tmp/release/checked/ocean
//   --dir=/opt/ocean-intelligence/data --out=/tmp/release/prepared/ocean
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const options=Object.fromEntries(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return [arg.slice(2,at),arg.slice(at+1)];}));
if(Object.keys(options).some(key=>!['system','root','dir','out'].includes(key))||!['ocean','low-carbon'].includes(options.system)||!options.root||!options.dir||!options.out)throw Error('Required: --system=ocean|low-carbon --root=PROGRAM --dir=PRIVATE_DATA --out=PREPARED');
const {system}=options,root=path.resolve(options.root),dir=path.resolve(options.dir),out=path.resolve(options.out);
if(out===dir||out.startsWith(dir+path.sep))throw Error('Prepare in a separate bundle directory before publishing');
process.env.APP_ID=system;
if(system==='low-carbon')process.env.LC_COLLECTION_MODE='shared';
const connectionString=process.env.INTEL_DATABASE_URL||process.env.DATABASE_URL;
if(!connectionString)throw Error('Research database must be configured');
const {Pool}=createRequire(path.join(root,'package.json'))('pg'),pool=new Pool({connectionString,max:2,options:'-c default_transaction_read_only=on',application_name:'prepare-workspace-readonly'}),load=name=>import(pathToFileURL(path.join(root,'intelligence',name)));
try{
 const started=performance.now(),{readWorkspace}=await load('workspace-storage.mjs'),{applyDataEdits,loadDataEdits,queryData,setRecordRevisions}=await load('insight-data.mjs');
 const raw=applyDataEdits(await readWorkspace(pool,null,{fastMetadata:true}),await loadDataEdits(pool));
 const {projectWorkspaceSnapshot}=await load('workspace-snapshot.mjs'),{workspaceIdentity,quantPage}=await load('workspace-page.mjs'),{getQuantCatalog}=await load('quant-routes.mjs'),{readStrategyCatalog,StrategyRepository}=await load('strategy/service.mjs'),{standardTopics}=await load('industry-topics.mjs'),{countries}=await load('core.mjs');
 const {snapshot,revisions}=await projectWorkspaceSnapshot(raw);setRecordRevisions(snapshot,revisions);
 const identity=workspaceIdentity(raw),scope=JSON.parse(await fs.readFile(path.join(dir,'sensing-page.json'),'utf8')).scope;
 if(!scope)throw Error('Existing source cache must identify this subsystem');
 const catalog=getQuantCatalog(snapshot,{}),filterOptions={topics:standardTopics.map(({id,name})=>({id,name})),countries:countries.map(({code,name})=>({code,name})),sources:catalog.sources.map(({id,name})=>({id,name}))};
 const modelReady=system==='ocean'&&process.env.INTEL_ENABLE_AI==='true'&&!!process.env.OPENAI_API_KEY&&!!process.env.CHAT_MODEL;
 const store={data:snapshot,researchByIds:async ids=>ids.length?(await pool.query('SELECT payload FROM ocean_intel.research WHERE id=ANY($1::text[])',[ids])).rows.map(row=>row.payload):[]};
 const research=await readStrategyCatalog(store,dir,{}, {repository:new StrategyRepository(dir,{readOnly:true}),catalog,client:modelReady?{}:null,model:modelReady?'configured':''});
 const views={'quant:{}':quantPage(catalog,identity,filterOptions),'inventory:{}':{...queryData(snapshot,{kind:'documents',page:'1',pageSize:'25'}),snapshotAt:snapshot.generatedAt,filterOptions,workspaceView:{version:identity}},'research:{}':research};
 await fs.mkdir(out,{recursive:true,mode:0o700});await fs.chmod(out,0o700);
 for(const [name,value]of Object.entries({'workspace-input.json':{schema:1,scope,identity,snapshot,revisions:[...revisions]},'workspace-page.json':{schema:1,scope,identity,views}})){
  const temporary=path.join(out,name+'.next');await fs.writeFile(temporary,JSON.stringify(value),{mode:0o600});await fs.chmod(temporary,0o600);await fs.rename(temporary,path.join(out,name));
 }
 console.log(JSON.stringify({system,prepared:true,elapsedMs:Math.round(performance.now()-started),documents:snapshot.documents.length,cards:catalog.cards.length,methods:research.methods.length}));
}finally{await pool.end();}
