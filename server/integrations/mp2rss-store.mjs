// MP_CLEAN_V1
import {prepareMPItem} from './mp-content-clean.mjs';
import pg from 'pg';
import {client,connection,subscriptions,items,hash} from './mp2rss-client.mjs';
import {classifyRecord,compileRules} from '../../intelligence/industry-classification.mjs';
export const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:8000});
let initialized;
export function init(){return initialized||=(async()=>{await pool.query(`CREATE SCHEMA IF NOT EXISTS mp2rss;
 CREATE TABLE IF NOT EXISTS mp2rss.subscriptions(id text PRIMARY KEY, source_id integer REFERENCES public.sources(id), payload jsonb NOT NULL, enabled boolean NOT NULL DEFAULT true, posts boolean NOT NULL DEFAULT false, articles boolean NOT NULL DEFAULT true, present boolean NOT NULL DEFAULT true, checked_at timestamptz, last_sync timestamptz, status text, error text);
 CREATE TABLE IF NOT EXISTS mp2rss.items(id text PRIMARY KEY, subscription_id text NOT NULL REFERENCES mp2rss.subscriptions(id), article_id integer REFERENCES public.articles(id), payload jsonb NOT NULL, content_hash text NOT NULL, classification jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS mp2rss.versions(id text NOT NULL, hash text NOT NULL, payload jsonb NOT NULL, captured_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(id,hash));
 CREATE TABLE IF NOT EXISTS mp2rss.jobs(id bigserial PRIMARY KEY, action text NOT NULL, target text, status text NOT NULL DEFAULT 'queued', created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz, result jsonb, error text);
 CREATE TABLE IF NOT EXISTS mp2rss.state(id text PRIMARY KEY,payload jsonb NOT NULL);
 `);})().catch(e=>{initialized=null;throw e;});}
export async function refresh(api){const all=await subscriptions(api);const db=await pool.connect();try{await db.query('BEGIN');for(const s of all){let source=(await db.query('SELECT source_id FROM mp2rss.subscriptions WHERE id=$1',[s.id])).rows[0]?.source_id;
 if(!source){const r=await db.query(`INSERT INTO public.sources(fakeid,name,type,is_overseas) VALUES($1,$2,$3,$4) ON CONFLICT(fakeid) DO UPDATE SET name=EXCLUDED.name RETURNING id`,['mp2rss_'+s.id,s.name,s.platform==='mp'?'mp2rss_mp':'mp2rss_x',s.platform==='x']);source=r.rows[0].id;}
 await db.query(`INSERT INTO mp2rss.subscriptions(id,source_id,payload,present,checked_at) VALUES($1,$2,$3,true,now()) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,present=true,checked_at=now()`,[s.id,source,s]);}
 await db.query('UPDATE mp2rss.subscriptions SET present=false WHERE NOT(id=ANY($1::text[]))',[all.map(s=>s.id)]);await db.query('COMMIT');return all.length;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
const html=text=>'<p>'+String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\n','<br>')+'</p>';
export async function persistItem(s,item,compiled){item=prepareMPItem(item);const db=await pool.connect();try{await db.query('BEGIN');const old=(await db.query('SELECT content_hash FROM mp2rss.items WHERE id=$1',[item.key])).rows[0];if(old?.content_hash===item.hash){await db.query('COMMIT');return 'duplicate';}
 const classification=classifyRecord(item,compiled);const status=classification.status==='accepted'?'accepted':classification.status==='excluded'?'rejected':'pending';
 const r=await db.query(`INSERT INTO public.articles(title,link,content,digest,author_name,source_id,source_type,external_id,published_at,download_status,filter_status,matched_topic,classify_method) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'keyword') ON CONFLICT(link) DO UPDATE SET content=CASE WHEN EXCLUDED.content IS NOT NULL THEN EXCLUDED.content ELSE articles.content END,updated_at=now(),title=EXCLUDED.title,download_status=CASE WHEN EXCLUDED.content IS NOT NULL THEN 'downloaded' ELSE articles.download_status END,vectorized=false,filter_status=CASE WHEN articles.classify_method='manual' THEN articles.filter_status ELSE EXCLUDED.filter_status END,matched_topic=CASE WHEN articles.classify_method='manual' THEN articles.matched_topic ELSE EXCLUDED.matched_topic END RETURNING id`,[item.title,item.url,item.content?html(item.content):null,item.summary||null,item.author,s.source_id,'mp2rss_'+item.source.platform,item.key.slice(0,128),item.publishedAt,item.content?'downloaded':'pending',status,classification.primary]);
 const articleId=r.rows[0].id;
 // Version changes invalidate old chunks; human classification remains untouched on URL conflicts.
 await db.query('DELETE FROM public.article_chunks WHERE article_id=$1',[articleId]);
 await db.query(`INSERT INTO mp2rss.versions(id,hash,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[item.key,item.hash,item]);
 await db.query(`INSERT INTO mp2rss.items(id,subscription_id,article_id,payload,content_hash,classification) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,content_hash=EXCLUDED.content_hash,classification=EXCLUDED.classification,updated_at=now()`,[item.key,s.id,articleId,item,item.hash,classification]);await db.query('COMMIT');return old?'updated':'inserted';
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
export async function enqueue(action='sync',target=null){await init();if(!['sync','refresh'].includes(action))throw Error('不支持的任务');if(target&&!(await pool.query('SELECT id FROM mp2rss.subscriptions WHERE id=$1',[target])).rowCount)throw Error('订阅不存在');
 const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(73201911)');const previous=(await c.query("SELECT id FROM mp2rss.jobs WHERE status IN ('queued','running') AND action=$1 AND target IS NOT DISTINCT FROM $2 ORDER BY id LIMIT 1",[action,target])).rows[0];const row=previous||(await c.query('INSERT INTO mp2rss.jobs(action,target) VALUES($1,$2) RETURNING id',[action,target])).rows[0];await c.query('COMMIT');return row;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export async function status(){await init();let configured=true;try{connection();}catch{configured=false;}
 const list=(await pool.query(`SELECT s.*,coalesce(c.count,0)::int AS count,coalesce(c.ready,0)::int AS ready,c.latest FROM mp2rss.subscriptions s LEFT JOIN (SELECT subscription_id,count(*) count,count(*) FILTER(WHERE payload->>'contentStatus'='complete') ready,max(payload->>'publishedAt') latest FROM mp2rss.items GROUP BY subscription_id)c ON c.subscription_id=s.id ORDER BY s.payload->>'platform',s.payload->>'name'`)).rows;
 const jobs=(await pool.query('SELECT * FROM mp2rss.jobs ORDER BY id DESC LIMIT 12')).rows;const state=(await pool.query("SELECT payload FROM mp2rss.state WHERE id='sync'")).rows[0]?.payload||{};
 let bridge={eligible:0,delivered:0,translated:0,extracted:0};
 if((await pool.query("SELECT to_regclass('ocean_intel.documents') AS t")).rows[0].t)bridge=(await pool.query(`SELECT count(*)::int eligible,count(d.id)::int delivered,count(d.id) FILTER(WHERE d.payload->>'language'='zh' OR d.payload->>'translationVersion'=d.payload->>'versionId')::int translated,count(d.id) FILTER(WHERE d.payload->'autoExtraction'->>'status'='completed')::int extracted FROM mp2rss.items i LEFT JOIN ocean_intel.documents d ON d.payload->>'url'=i.payload->>'url' AND d.payload->>'providerHash'=i.content_hash WHERE i.classification->>'status'='accepted' AND i.payload->>'contentStatus'='complete'`)).rows[0];
 return {configured,intervalMinutes:30,state,list,jobs,bridge};}
export async function update(id,body){await init();for(const field of ['enabled','posts','articles'])if(body[field]!==undefined&&typeof body[field]!=='boolean')throw Error('开关参数必须为布尔值');return(await pool.query('UPDATE mp2rss.subscriptions SET enabled=coalesce($2,enabled),posts=coalesce($3,posts),articles=coalesce($4,articles) WHERE id=$1 RETURNING id',[id,body.enabled??null,body.posts??null,body.articles??null])).rows[0];}
export async function execute(){await init();const guard=await pool.connect();try{if(!(await guard.query('SELECT pg_try_advisory_lock(73201910) AS locked')).rows[0].locked)return {busy:true};
 // The session lock proves there is no surviving worker. Recover only abandoned running jobs.
 await pool.query("UPDATE mp2rss.jobs SET status='queued',error='进程中断，自动重试' WHERE status='running'");
 let job=(await pool.query("SELECT * FROM mp2rss.jobs WHERE status='queued' ORDER BY id LIMIT 1")).rows[0];
 if(!job){const st=(await pool.query("SELECT payload FROM mp2rss.state WHERE id='sync'")).rows[0]?.payload;if(st?.nextRunAt&&Date.parse(st.nextRunAt)>Date.now())return {idle:true};job=(await pool.query("INSERT INTO mp2rss.jobs(action) VALUES('sync') RETURNING *")).rows[0];}
 await pool.query("UPDATE mp2rss.jobs SET status='running',started_at=now(),error=NULL WHERE id=$1",[job.id]);const result={inserted:0,updated:0,duplicate:0,failed:0,streams:[],accounts:0};
 try{const api=client();result.accounts=await refresh(api);if(job.action==='sync'){
  const rules=(await pool.query('SELECT * FROM public.filter_rules')).rows,compiled=compileRules({rules});const ss=(await pool.query('SELECT * FROM mp2rss.subscriptions WHERE enabled AND present AND ($1::text IS NULL OR id=$1)',[job.target])).rows;
  for(const s of ss){const src=s.payload;const kinds=src.platform==='mp'?(s.articles?['articles']:[]):[...(s.posts?['posts']:[]),...(s.articles?['articles']:[])];let sourceFailed=false;
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
 await pool.query("INSERT INTO mp2rss.state(id,payload) VALUES('sync',$1) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload",[{lastRunAt:new Date().toISOString(),nextRunAt:new Date(Date.now()+30*60000).toISOString()}]);return result;
 }finally{await guard.query('SELECT pg_advisory_unlock(73201910)');guard.release();}}
