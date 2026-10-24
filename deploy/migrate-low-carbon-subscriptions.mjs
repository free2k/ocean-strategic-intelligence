// Run on Alibaba only. Input is a read-only, repeatable-read Tencent snapshot.
// Historical source queues/rules are archived; they never become low-carbon jobs.
import fs from 'node:fs';
import {createGunzip} from 'node:zlib';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {classifyRecord,compileRules} from '../intelligence/industry-classification.mjs';
import {currentRules,digest,textBody} from '../intelligence/classification-jobs.mjs';
import {verifyLowCarbonEnvironment} from '../intelligence/low-carbon/runtime.mjs';
import {parseSnapshot} from '../intelligence/low-carbon/subscription-snapshot.mjs';

const [mode,file,batch='tencent-20261018']=process.argv.slice(2);
if(!['shared','low-carbon'].includes(mode)||!file?.startsWith('/opt/low-carbon/migrations/')||!/^[a-z0-9-]+$/.test(batch)||!fs.existsSync('/opt/low-carbon/credentials.json'))throw Error('MIGRATION_TARGET_REJECTED');
const low=mode==='low-carbon',url=new URL(process.env.DATABASE_URL);
if(!['localhost','127.0.0.1'].includes(url.hostname)||Number(url.port||5432)!==(low?55432:5432)||url.pathname!==(low?'/low_carbon_kb':'/knowledge_base')||(process.env.APP_ID==='low-carbon')!==low)throw Error('MIGRATION_DATABASE_REJECTED');
if(low)await verifyLowCarbonEnvironment();
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
const source='tencent-49.233.77.111',counts={},written={},cache=new Map(),sourceMap=new Map(),articleMap=new Map(),manual=new Map(),jobMap=new Map();
const hash=value=>createHash('sha256').update(value).digest('hex');
const known=new Set(['meta','public.sources','public.articles','public.article_chunks','mp2rss.subscriptions','mp2rss.items','mp2rss.versions','mp2rss.manual_bodies','mp2rss.jobs','mp2rss.state','mp2rss.discovery','mp2rss.evidence_links','mp2rss.evidence_documents','mp2rss.evidence_versions','classification.articles','classification.jobs','classification.audit','classification.semantic_queue','classification.semantic_cache','public.filter_rules']);
async function* rows(table){let after=0;for(;;){const list=(await db.query('SELECT ordinal,payload FROM subscription_import.rows WHERE batch_id=$1 AND table_name=$2 AND ordinal>$3 ORDER BY ordinal LIMIT 40',[batch,table,after])).rows;if(!list.length)return;for(const r of list)yield r.payload;after=list.at(-1).ordinal;}}
async function upsert(table,row,conflict,{autoId=false,preserve=[]}={}){
 let all=cache.get(table);if(!all){const [schema,name]=table.split('.');all=(await db.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position',[schema,name])).rows.map(r=>r.column_name);cache.set(table,all);}
 const columns=all.filter(k=>k in row&&!(autoId&&k==='id'));
 const updates=columns.filter(k=>!conflict.includes(k)&&!preserve.includes(k));
 const ident=k=>'"'+k.replaceAll('"','""')+'"';
 const result=await db.query(`INSERT INTO ${table} (${columns.map(ident)}) SELECT ${columns.map(ident)} FROM jsonb_populate_record(NULL::${table},$1::jsonb) ON CONFLICT (${conflict.map(ident)}) ${updates.length?'DO UPDATE SET '+updates.map(k=>ident(k)+'=EXCLUDED.'+ident(k)).join(','):'DO NOTHING'} RETURNING *`,[JSON.stringify(row)]);
 written[table]=(written[table]||0)+1;return result.rows[0];
}
async function mapped(entity,sourceId,create){
 const prior=(await db.query('SELECT destination_id FROM subscription_import.id_map WHERE source=$1 AND entity=$2 AND source_id=$3',[source,entity,String(sourceId)])).rows[0];
 if(prior)return Number(prior.destination_id);
 const id=await create();await db.query('INSERT INTO subscription_import.id_map(source,entity,source_id,destination_id) VALUES($1,$2,$3,$4)',[source,entity,String(sourceId),id]);return id;
}
try{
 await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='15s'");await db.query("SET LOCAL statement_timeout='120s'");
 await db.query('SELECT pg_advisory_xact_lock(73201910)');await db.query('SELECT pg_advisory_xact_lock(73201912)');
 await db.query(`CREATE SCHEMA IF NOT EXISTS subscription_import;
 CREATE TABLE IF NOT EXISTS subscription_import.rows(batch_id text NOT NULL,table_name text NOT NULL,row_key text NOT NULL,ordinal bigint NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(batch_id,table_name,row_key));
 CREATE INDEX IF NOT EXISTS subscription_import_rows_page ON subscription_import.rows(batch_id,table_name,ordinal);
 CREATE TABLE IF NOT EXISTS subscription_import.id_map(source text NOT NULL,entity text NOT NULL,source_id text NOT NULL,destination_id bigint NOT NULL,PRIMARY KEY(source,entity,source_id));
 CREATE TABLE IF NOT EXISTS subscription_import.batches(id text PRIMARY KEY,manifest jsonb NOT NULL,completed_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS mp2rss.manual_bodies(item_id text PRIMARY KEY REFERENCES mp2rss.items(id),body text NOT NULL,updated_at timestamptz DEFAULT now());
 CREATE TABLE IF NOT EXISTS mp2rss.discovery(name text PRIMARY KEY,payload jsonb NOT NULL,updated_at timestamptz DEFAULT now());`);
 if((await db.query('SELECT 1 FROM subscription_import.batches WHERE id=$1',[batch])).rowCount)throw Error('MIGRATION_ALREADY_COMPLETED');
 for(const table of ['public.sources','public.articles','mp2rss.jobs','classification.jobs','public.article_chunks']){
  const sequence=(await db.query('SELECT pg_get_serial_sequence($1,\'id\') name',[table])).rows[0]?.name;
  if(sequence)await db.query(`SELECT setval($1::regclass,greatest((SELECT coalesce(max(id),1) FROM ${table}),(SELECT last_value FROM ${sequence})),true)`,[sequence]);
 }
 let ordinal=0,pending=[],size=0,meta;
 const flush=async()=>{if(!pending.length)return;await db.query(`INSERT INTO subscription_import.rows(batch_id,table_name,row_key,ordinal,payload) SELECT $1,r.table_name,r.row_key,r.ordinal,r.payload FROM jsonb_to_recordset($2::jsonb) AS r(table_name text,row_key text,ordinal bigint,payload jsonb) ON CONFLICT DO NOTHING`,[batch,JSON.stringify(pending)]);pending=[];size=0;};
 for await(const value of parseSnapshot(fs.createReadStream(file).pipe(createGunzip()))){
  if(!known.has(value.table))throw Error('UNEXPECTED_SOURCE_TABLE');
  if(value.table==='meta'){meta=value.row;if(meta.readOnly!=='on'||meta.database!=='knowledge_base')throw Error('SOURCE_NOT_READ_ONLY');}
  const serialized=JSON.stringify(value.row);counts[value.table]=(counts[value.table]||0)+1;pending.push({table_name:value.table,row_key:hash(serialized),ordinal:++ordinal,payload:value.row});size+=serialized.length;
  if(size>1024*1024||pending.length>=100)await flush();
 }
 await flush();if(!meta||counts['mp2rss.subscriptions']<100||counts['mp2rss.items']<1000)throw Error('SOURCE_SNAPSHOT_INCOMPLETE');
 for(const [table,count] of Object.entries(counts))if(Number((await db.query('SELECT count(*) FROM subscription_import.rows WHERE batch_id=$1 AND table_name=$2',[batch,table])).rows[0].count)!==count)throw Error('ARCHIVE_COUNT_MISMATCH');
 const compiled=low?compileRules(await currentRules(db)):null;
 for await(const r of rows('public.sources')){
  const prior=r.fakeid?(await db.query('SELECT * FROM public.sources WHERE fakeid=$1',[r.fakeid])).rows[0]:null;
  let saved;if(prior){saved=await upsert('public.sources',{...r,id:prior.id},['fakeid']);}else saved=await upsert('public.sources',r,['fakeid'],{autoId:true});
  sourceMap.set(r.id,saved.id);
 }
 for await(const r of rows('public.articles')){
  const existing=(await db.query('SELECT * FROM public.articles WHERE link=$1',[r.link])).rows[0];
  let row={...r,source_id:sourceMap.get(r.source_id)||null};
  if(low){const c=classifyRecord({title:r.title,content:textBody(r.content)},compiled);row={...row,filter_status:c.status==='accepted'?'accepted':c.status==='excluded'?'rejected':'pending',matched_topic:c.primary,reject_reason:c.status==='excluded'?c.reason:null,classify_method:'keyword',manual_classify:false,matched_keywords_json:null,vectorized:false,summary:null,summary_status:'pending'};}
  if(existing){
   if(!row.content)row.content=existing.content;
   if(existing.manual_classify||existing.classify_method==='manual'){for(const key of ['manual_classify','classify_method','filter_status','matched_topic','reject_reason','matched_keywords_json'])row[key]=existing[key];manual.set(existing.id,existing);}
   row.vectorized=existing.vectorized;row.id=existing.id;
  }
  const saved=await upsert('public.articles',row,['link'],{autoId:!existing});articleMap.set(r.id,saved.id);
 }
 for await(const r of rows('mp2rss.subscriptions'))await upsert('mp2rss.subscriptions',{...r,source_id:sourceMap.get(r.source_id)||null},['id']);
 for await(const r of rows('mp2rss.items')){
  const articleId=articleMap.get(r.article_id);if(r.article_id&&!articleId)throw Error('ARTICLE_REFERENCE_MISSING');
  let decision=r.classification;
  if(low){const a=manual.get(articleId);decision=a?{manual:true,method:'manual',status:a.filter_status==='accepted'?'accepted':a.filter_status==='rejected'?'excluded':'unmatched',primary:a.matched_topic,topics:a.matched_topic?[a.matched_topic]:[],positive:[],negative:[],reason:a.reject_reason||'保留低碳人工分类',version:compiled.version}:classifyRecord({title:r.payload.title,content:r.payload.content},compiled);}
  await upsert('mp2rss.items',{...r,article_id:articleId,classification:decision},['id']);
  if(low&&articleId)await upsert('classification.articles',{article_id:articleId,classification:decision,input_hash:digest([r.payload.title,textBody(r.payload.content)]),job_id:null,updated_at:new Date().toISOString()},['article_id']);
 }
 for(const table of ['mp2rss.versions','mp2rss.manual_bodies','mp2rss.discovery','mp2rss.evidence_links','mp2rss.evidence_documents','mp2rss.evidence_versions'])for await(const r of rows(table)){
  const pk=table==='mp2rss.versions'?['id','hash']:table==='mp2rss.evidence_versions'?['url','hash']:table==='mp2rss.manual_bodies'?['item_id']:table==='mp2rss.discovery'?['name']:['url'];
  const next={...r};if(low&&table==='mp2rss.evidence_documents')next.classification=classifyRecord({title:r.payload.title,content:r.payload.content},compiled);
  // Discovery and evidence-link status are historical source metadata. A pending
  // source fetch is not imported as an executable low-carbon background job.
  if(low&&table==='mp2rss.evidence_links'&&['pending','running'].includes(r.status))next.status='imported';
  await upsert(table,next,pk);
 }
 if(!low){
  for(const table of ['mp2rss.jobs','classification.jobs'])for await(const r of rows(table)){
   const active=['queued','running','classifying','processing'].includes(r.status),next={...r,status:active?'imported':r.status};
   const id=await mapped(table,r.id,async()=>{const prior=(await db.query(`SELECT id FROM ${table} WHERE created_at=$1 LIMIT 1`,[r.created_at])).rows[0];if(prior){await upsert(table,{...next,id:prior.id},['id']);return prior.id;}return(await upsert(table,next,['id'],{autoId:true})).id;});
   if(table==='classification.jobs')jobMap.set(r.id,id);
  }
  for await(const r of rows('classification.articles'))if(!manual.has(articleMap.get(r.article_id)))await upsert('classification.articles',{...r,article_id:articleMap.get(r.article_id),job_id:r.job_id?jobMap.get(r.job_id):null},['article_id']);
  for await(const r of rows('classification.audit'))await upsert('classification.audit',{...r,article_id:articleMap.get(r.article_id),job_id:jobMap.get(r.job_id)},['job_id','article_id']);
  for await(const r of rows('classification.semantic_cache'))await upsert('classification.semantic_cache',r,['key']);
  for await(const r of rows('mp2rss.state'))await upsert('mp2rss.state',r,['id']);
  // semantic_queue remains an exact archive: replaying source pending decisions
  // against a different runtime/rule version would spend AI quota unexpectedly.
  for await(const r of rows('public.article_chunks'))if(articleMap.get(r.article_id)&&!(await db.query('SELECT 1 FROM public.article_chunks WHERE article_id=$1 AND chunk_index=$2 LIMIT 1',[articleMap.get(r.article_id),r.chunk_index])).rowCount)await upsert('public.article_chunks',{...r,article_id:articleMap.get(r.article_id)},['id'],{autoId:true});
 }
 const checks={};
 for(const [table,condition] of [
  ['mp2rss.subscriptions',"d.id=r.payload->>'id' AND d.payload=r.payload->'payload' AND d.present=(r.payload->>'present')::boolean"],
  ['mp2rss.items',"d.id=r.payload->>'id' AND d.payload=r.payload->'payload' AND d.content_hash=r.payload->>'content_hash'"],
  ['mp2rss.versions',"d.id=r.payload->>'id' AND d.hash=r.payload->>'hash' AND d.payload=r.payload->'payload'"],
  ['mp2rss.manual_bodies',"d.item_id=r.payload->>'item_id' AND d.body=r.payload->>'body'"],
  ['mp2rss.evidence_documents',"d.url=r.payload->>'url' AND d.payload=r.payload->'payload'"],
  ['mp2rss.evidence_versions',"d.url=r.payload->>'url' AND d.hash=r.payload->>'hash' AND d.payload=r.payload->'payload'"]
 ]){checks[table]=Number((await db.query(`SELECT count(*) FROM subscription_import.rows r WHERE r.batch_id=$1 AND r.table_name=$2 AND NOT EXISTS(SELECT 1 FROM ${table} d WHERE ${condition})`,[batch,table])).rows[0].count);if(checks[table])throw Error('IMPORTED_PAYLOAD_MISMATCH:'+table);}
 const manifest={source,mode,meta,counts,written,checks,ruleVersion:compiled?.version||null,historyQueuesReplayed:false,sourceRulesActivated:false,completedAt:new Date().toISOString()};
 await db.query('INSERT INTO subscription_import.batches(id,manifest) VALUES($1,$2)',[batch,manifest]);
 await db.query('COMMIT');console.log(JSON.stringify(manifest));
}catch(e){await db.query('ROLLBACK');console.error(JSON.stringify({failed:true,code:e.code||e.message,table:e.table||null}));process.exitCode=1;}finally{await db.end();}
