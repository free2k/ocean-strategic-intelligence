import {cachedAudit,auditBridge} from '../../intelligence/classification-audit.mjs';
import {inputHash,queueSemantic} from '../../intelligence/semantic-classification.mjs';
// MP_CLEAN_V1
import {initClassification,decideArticle} from '../../intelligence/classification-jobs.mjs';
import {prepareMPItem} from './mp-content-clean.mjs';
import {runBatch} from './mp2rss-batch.mjs';
import {runDiscovery,enqueueVerified} from './mp-discovery.mjs';
import pg from 'pg';
import {subscriptionHistory} from './subscription-history.mjs';
import {client,connection,subscriptions,items,hash} from './mp2rss-client.mjs';
import {classifyRecord,compileRules} from '../../intelligence/industry-classification.mjs';
export const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:8000});
let initialized;
export function init(){return initialized||=(async()=>{await pool.query(`CREATE SCHEMA IF NOT EXISTS mp2rss;
 CREATE TABLE IF NOT EXISTS mp2rss.subscriptions(id text PRIMARY KEY, source_id integer REFERENCES public.sources(id), payload jsonb NOT NULL, enabled boolean NOT NULL DEFAULT true, posts boolean NOT NULL DEFAULT false, articles boolean NOT NULL DEFAULT true, present boolean NOT NULL DEFAULT true, checked_at timestamptz, last_sync timestamptz, status text, error text);
 CREATE TABLE IF NOT EXISTS mp2rss.items(id text PRIMARY KEY, subscription_id text NOT NULL REFERENCES mp2rss.subscriptions(id), article_id integer REFERENCES public.articles(id), payload jsonb NOT NULL, content_hash text NOT NULL, classification jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS mp2rss.versions(id text NOT NULL, hash text NOT NULL, payload jsonb NOT NULL, captured_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(id,hash));
 CREATE TABLE IF NOT EXISTS mp2rss.manual_bodies(item_id text PRIMARY KEY REFERENCES mp2rss.items(id),body text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS mp2rss.jobs(id bigserial PRIMARY KEY, action text NOT NULL, target text, status text NOT NULL DEFAULT 'queued', created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz, result jsonb, error text);
 CREATE TABLE IF NOT EXISTS mp2rss.state(id text PRIMARY KEY,payload jsonb NOT NULL);
 ALTER TABLE mp2rss.jobs ADD COLUMN IF NOT EXISTS request jsonb;
 UPDATE mp2rss.subscriptions SET enabled=true,articles=true WHERE NOT enabled OR NOT articles;
 `);await initClassification(pool);})().catch(e=>{initialized=null;throw e;});}
export async function refresh(api){const all=await subscriptions(api);const db=await pool.connect();try{await db.query('BEGIN');for(const s of all){let source=(await db.query('SELECT source_id FROM mp2rss.subscriptions WHERE id=$1',[s.id])).rows[0]?.source_id;
 if(!source){const r=await db.query(`INSERT INTO public.sources(fakeid,name,type,is_overseas) VALUES($1,$2,$3,$4) ON CONFLICT(fakeid) DO UPDATE SET name=EXCLUDED.name RETURNING id`,['mp2rss_'+s.id,s.name,s.platform==='mp'?'mp2rss_mp':'mp2rss_x',s.platform==='x']);source=r.rows[0].id;}
 await db.query(`INSERT INTO mp2rss.subscriptions(id,source_id,payload,present,checked_at) VALUES($1,$2,$3,true,now()) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,present=true,enabled=true,articles=true,checked_at=now()`,[s.id,source,s]);}
 await db.query('UPDATE mp2rss.subscriptions SET present=false WHERE NOT(id=ANY($1::text[]))',[all.map(s=>s.id)]);await db.query('COMMIT');return all.length;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
const html=text=>'<p>'+String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\n','<br>')+'</p>';
export async function persistItem(s,item,compiled,{manualBody,recoveredBody}={}){const db=await pool.connect();try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[item.key]);
 const prior=(await db.query('SELECT payload FROM mp2rss.items WHERE id=$1',[item.key])).rows[0]?.payload;
 // Check under the item lock: never replace a body that arrived during recovery.
 if(recoveredBody&&prior?.content){await db.query('COMMIT');return 'duplicate';}
 if(manualBody===undefined&&item.kind==='x_post'&&!item.content&&prior?.bodyOrigin==='x_original_proxy'&&prior.content){await db.query('COMMIT');return 'duplicate';}
 if(recoveredBody){item={...item,content:recoveredBody.content,title:Array.from(recoveredBody.content).slice(0,90).join(''),contentStatus:'complete',bodyOrigin:'x_original_proxy',bodyRecovery:{...recoveredBody,content:undefined,status:'recovered'}};item.hash=hash(JSON.stringify({content:item.content,title:item.title,context:item.context,publishedAt:item.publishedAt}));}
 if(manualBody!==undefined)await db.query('INSERT INTO mp2rss.manual_bodies(item_id,body) VALUES($1,$2) ON CONFLICT(item_id) DO UPDATE SET body=EXCLUDED.body,updated_at=now()',[item.key,manualBody]);const manual=(await db.query('SELECT body,updated_at FROM mp2rss.manual_bodies WHERE item_id=$1',[item.key])).rows[0];if(manual)item={...item,originalContent:manual.body,content:manual.body,bodyOrigin:'manual',manualBodyAt:manual.updated_at};item=prepareMPItem(item);const old=(await db.query('SELECT content_hash FROM mp2rss.items WHERE id=$1',[item.key])).rows[0];if(old?.content_hash===item.hash){await db.query('COMMIT');return 'duplicate';}
 let classification=classifyRecord(item,compiled);const status=classification.status==='accepted'?'accepted':classification.status==='excluded'?'rejected':'pending';
 const r=await db.query(`INSERT INTO public.articles(title,link,content,digest,author_name,source_id,source_type,external_id,published_at,download_status,filter_status,matched_topic,classify_method) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'keyword') ON CONFLICT(link) DO UPDATE SET content=CASE WHEN EXCLUDED.content IS NOT NULL THEN EXCLUDED.content ELSE articles.content END,updated_at=now(),title=EXCLUDED.title,download_status=CASE WHEN EXCLUDED.content IS NOT NULL THEN 'downloaded' ELSE articles.download_status END,vectorized=false,filter_status=CASE WHEN (articles.manual_classify OR articles.classify_method='manual') THEN articles.filter_status ELSE EXCLUDED.filter_status END,matched_topic=CASE WHEN (articles.manual_classify OR articles.classify_method='manual') THEN articles.matched_topic ELSE EXCLUDED.matched_topic END RETURNING id`,[item.title,item.url,item.content?html(item.content):null,item.summary||null,item.author,s.source_id,'mp2rss_'+item.source.platform,item.key.slice(0,128),item.publishedAt,item.content?'downloaded':'pending',status,classification.primary]);
 const articleId=r.rows[0].id;
 const saved=(await db.query('SELECT manual_classify,classify_method,filter_status,matched_topic,reject_reason FROM public.articles WHERE id=$1',[articleId])).rows[0];if(saved.manual_classify||saved.classify_method==='manual')classification=decideArticle({...saved,title:item.title,mp_content:item.content},compiled).decision;
 if(!classification.manual)await db.query("UPDATE public.articles SET classify_method='keyword' WHERE id=$1",[articleId]);
 classification=await queueSemantic(db,{id:articleId,title:item.title,content:item.content},compiled,classification);
 // Persist the final decision, including a reused semantic result, atomically.
 await db.query('INSERT INTO classification.articles(article_id,classification,input_hash,job_id) VALUES($1,$2,$3,NULL) ON CONFLICT(article_id) DO UPDATE SET classification=EXCLUDED.classification,input_hash=EXCLUDED.input_hash,job_id=NULL,updated_at=now()',[articleId,classification,inputHash(item.title,item.content)]);
 if(!classification.manual)await db.query("UPDATE public.articles SET filter_status=$2::text,matched_topic=$3,classify_method=$4,reject_reason=$5,matched_keywords_json=NULL,updated_at=now() WHERE id=$1 AND NOT manual_classify AND classify_method IS DISTINCT FROM 'manual'",[articleId,classification.status==='accepted'?'accepted':classification.status==='excluded'?'rejected':'pending',classification.primary,classification.method==='llm'?'llm':'keyword',classification.status==='excluded'?classification.reason?.slice(0,255):null]);
 // Version changes invalidate old chunks; human classification remains untouched on URL conflicts.
 await db.query('DELETE FROM public.article_chunks WHERE article_id=$1',[articleId]);
 await db.query(`INSERT INTO mp2rss.versions(id,hash,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[item.key,item.hash,item]);
 await db.query(`INSERT INTO mp2rss.items(id,subscription_id,article_id,payload,content_hash,classification) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,content_hash=EXCLUDED.content_hash,classification=EXCLUDED.classification,updated_at=now()`,[item.key,s.id,articleId,item,item.hash,classification]);await db.query('COMMIT');return old?'updated':'inserted';
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
export async function enqueue(action='sync',target=null){await init();if(!['sync','refresh'].includes(action))throw Error('不支持的任务');if(target&&!(await pool.query('SELECT id FROM mp2rss.subscriptions WHERE id=$1',[target])).rowCount)throw Error('订阅不存在');
 const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(73201911)');const previous=(await c.query("SELECT id FROM mp2rss.jobs WHERE status IN ('queued','running') AND action=$1 AND target IS NOT DISTINCT FROM $2 ORDER BY id LIMIT 1",[action,target])).rows[0];const row=previous||(await c.query('INSERT INTO mp2rss.jobs(action,target) VALUES($1,$2) RETURNING id',[action,target])).rows[0];await c.query('COMMIT');return row;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export async function status(){await init();let configured=true;try{connection();}catch{configured=false;}
 const list=(await pool.query(`SELECT s.*,coalesce(c.count,0)::int AS count,coalesce(c.ready,0)::int AS ready,c.latest FROM mp2rss.subscriptions s LEFT JOIN (SELECT subscription_id,count(*) count,count(*) FILTER(WHERE payload->>'contentStatus'='complete') ready,max(payload->>'publishedAt') latest FROM mp2rss.items GROUP BY subscription_id)c ON c.subscription_id=s.id ORDER BY s.payload->>'platform',s.payload->>'name'`)).rows;
 const history=await subscriptionHistory(pool,list);
 const jobs=(await pool.query('SELECT * FROM mp2rss.jobs ORDER BY id DESC LIMIT 12')).rows;const state=(await pool.query("SELECT payload FROM mp2rss.state WHERE id='sync'")).rows[0]?.payload||{};
 const pendingJobs=(await pool.query("SELECT id,action,target,request,status,created_at,started_at FROM mp2rss.jobs WHERE status IN ('queued','running') ORDER BY CASE WHEN status='running' THEN 0 WHEN action='batch_verified_subscribe' THEN 1 ELSE 2 END,id")).rows;
 const audit=await cachedAudit(pool),classification=audit.mpCounts,bridge=auditBridge(audit.documents);
 return {classification,observedAt:audit.observedAt,metricVersion:audit.metricVersion,scope:'mp2rss',configured,intervalMinutes:360,state,list,jobs,bridge,history,queue:{jobs:pendingJobs,pollSeconds:60,waiting:pendingJobs.filter(j=>j.status==='queued').length}};}
export async function update(id,body){await init();if(body.enabled===false||body.articles===false)throw Error('已订阅账号默认采集文章');if(body.posts!==undefined&&typeof body.posts!=='boolean')throw Error('开关参数必须为布尔值');return(await pool.query('UPDATE mp2rss.subscriptions SET enabled=true,posts=coalesce($2,posts),articles=true WHERE id=$1 RETURNING id',[id,body.posts??null])).rows[0];}
export async function execute(){await init();const guard=await pool.connect();try{if(!(await guard.query('SELECT pg_try_advisory_lock(73201910) AS locked')).rows[0].locked)return {busy:true};
 await initClassification(pool);
 const reprocess=(await pool.query("SELECT id FROM classification.jobs WHERE status IN ('queued','classifying','processing') ORDER BY id LIMIT 1")).rows[0];if(reprocess)return {reclassification:true,jobId:reprocess.id};
 // The session lock proves there is no surviving worker. Recover only abandoned running jobs.
 await pool.query("UPDATE mp2rss.jobs SET status='queued',error='进程中断，自动重试' WHERE status='running'");
 let job=(await pool.query("SELECT * FROM mp2rss.jobs WHERE status='queued' ORDER BY CASE WHEN action='batch_verified_subscribe' THEN 0 ELSE 1 END,id LIMIT 1")).rows[0];
 if(!job){const st=(await pool.query("SELECT payload FROM mp2rss.state WHERE id='sync'")).rows[0]?.payload;if(st?.nextRunAt&&Date.parse(st.nextRunAt)>Date.now()){const pendingReview=(await pool.query("SELECT 1 FROM classification.semantic_queue WHERE status IN ('pending','failed') AND next_retry_at<=now() LIMIT 1")).rowCount;return pendingReview?{semantic:true}:{idle:true};}job=(await pool.query("INSERT INTO mp2rss.jobs(action) VALUES('sync') RETURNING *")).rows[0];}
 await pool.query("UPDATE mp2rss.jobs SET status='running',started_at=now(),error=NULL WHERE id=$1",[job.id]);const result={inserted:0,updated:0,duplicate:0,failed:0,streams:[],accounts:0};
 if(job.action==='batch_discover'){result.discovery=[];try{result.discovery=await runDiscovery(job,pool);const verified=result.discovery.filter(r=>r.status==='verified').map(r=>r.name);if(job.target==='auto_subscribe'&&verified.length)result.subscriptionJob=(await enqueueVerified(pool,verified)).id;await pool.query('UPDATE mp2rss.jobs SET status=$2,finished_at=now(),result=$3 WHERE id=$1',[job.id,result.discovery.some(r=>r.status==='failed')?'partial':'completed',result]);}catch{await pool.query("UPDATE mp2rss.jobs SET status='failed',finished_at=now(),error='AI检索未完成，已有结果保留，可重新发起' WHERE id=$1",[job.id]);}return result;}
 try{const api=client();result.accounts=await refresh(api);if(['batch_subscribe','batch_unsubscribe','batch_verified_subscribe'].includes(job.action)){result.batch=await runBatch(job,pool,api);result.failed=result.batch.filter(x=>x.status!=='completed').length;result.accounts=await refresh(api);if(['batch_subscribe','batch_verified_subscribe'].includes(job.action))await enqueue('sync');}if(['sync','batch_sync'].includes(job.action)){
  const rules=(await pool.query('SELECT * FROM public.filter_rules')).rows,compiled=compileRules({rules});const ss=(await pool.query('SELECT * FROM mp2rss.subscriptions WHERE present AND ($1::text IS NULL OR id=$1) AND ($2::text[] IS NULL OR id=ANY($2::text[]))',[job.target,job.action==='batch_sync'?job.request:null])).rows;
  for(const s of ss){const src=s.payload;const kinds=src.platform==='mp'?['articles']:[...(s.posts?['posts']:[]),'articles'];let sourceFailed=false;
   for(const kind of kinds){const report={source:s.id,kind,inserted:0,updated:0,duplicate:0,failed:0};try{
     // Initial 3 days; recover downtime and overlap 7 days. Weekly full scan revisits old revisions/null bodies.
     const prior=(await pool.query("SELECT payload FROM mp2rss.state WHERE id=$1",['deep:'+s.id+':'+kind])).rows[0]?.payload;
     const deep=!!s.last_sync&&(!prior?.at||Date.parse(prior.at)<Date.now()-7*86400000);
     const since=deep?null:s.last_sync?new Date(s.last_sync).getTime()-7*86400000:Date.now()-3*86400000;
     for await(const item of items(api,src,kind,{since})){const key=await persistItem(s,item,compiled);report[key]++;result[key]++;}
     if(deep||!s.last_sync)await pool.query('INSERT INTO mp2rss.state(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload',['deep:'+s.id+':'+kind,{at:new Date().toISOString()}]);
    }catch(e){sourceFailed=true;report.failed++;result.failed++;report.error=e instanceof Error&&e.name==='ProviderError'?e.message:'本内容流处理失败，已保存资料保留';}
    result.streams.push(report);await pool.query('UPDATE mp2rss.jobs SET result=$2 WHERE id=$1',[job.id,result]);
   }
   await pool.query('UPDATE mp2rss.subscriptions SET last_sync=CASE WHEN $4 THEN last_sync ELSE now() END,status=$2,error=$3 WHERE id=$1',[s.id,sourceFailed?'partial':kinds.length?'completed':'paused',sourceFailed?'部分内容流失败，请查看任务记录':null,sourceFailed]);
  }
 }
 await pool.query('UPDATE mp2rss.jobs SET status=$2,finished_at=now(),result=$3 WHERE id=$1',[job.id,result.failed?'partial':'completed',result]);
 }catch{await pool.query("UPDATE mp2rss.jobs SET status='failed',finished_at=now(),error='供应商连接或同步失败；检查密钥、权益与网络' WHERE id=$1",[job.id]);result.failed++;}
 if(job.action==='sync'&&!job.target)await pool.query("INSERT INTO mp2rss.state(id,payload) VALUES('sync',$1) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload",[{lastRunAt:new Date().toISOString(),nextRunAt:new Date(Date.now()+360*60000).toISOString()}]);return result;
 }finally{await guard.query('SELECT pg_advisory_unlock(73201910)');guard.release();}}
