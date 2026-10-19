import {textSlice} from './unicode-text.mjs';
import {topicAliases,canonicalTopic} from './industry-topics.mjs';
import {initSemantic,queueSemantic} from './semantic-classification.mjs';
import {createHash} from 'node:crypto';
import {compileRules,classifyRecord} from './industry-classification.mjs';
import {dateRangeStart} from './article-scope.mjs';

export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const textBody=value=>String(value||'').replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
export async function initClassification(db){await initSemantic(db);await db.query(`CREATE SCHEMA IF NOT EXISTS classification;
 CREATE TABLE IF NOT EXISTS classification.jobs(id bigserial PRIMARY KEY,version text NOT NULL,config jsonb NOT NULL,scope jsonb NOT NULL,status text NOT NULL DEFAULT 'queued',preview jsonb NOT NULL,result jsonb NOT NULL DEFAULT '{}',error text,created_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,finished_at timestamptz);
 CREATE UNIQUE INDEX IF NOT EXISTS classification_one_active ON classification.jobs((true)) WHERE status IN ('queued','classifying','processing');
 CREATE TABLE IF NOT EXISTS classification.previews(token text PRIMARY KEY,version text NOT NULL,scope jsonb NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS classification.articles(article_id integer PRIMARY KEY REFERENCES public.articles(id),classification jsonb NOT NULL,input_hash text NOT NULL,job_id bigint REFERENCES classification.jobs(id),updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS classification.audit(job_id bigint REFERENCES classification.jobs(id),article_id integer REFERENCES public.articles(id),before_state jsonb NOT NULL,after_state jsonb NOT NULL,PRIMARY KEY(job_id,article_id));`);}
export async function currentRules(db){return {rules:(await db.query('SELECT id,type,topic,description,title_keywords,content_keywords,priority,require_all,groups,enabled FROM public.filter_rules ORDER BY id')).rows};}
export function scopeOf(value={}){const sourceId=value.sourceId==null||value.sourceId===''?null:Number(value.sourceId);if(sourceId!==null&&(!Number.isSafeInteger(sourceId)||sourceId<1))throw Error('无效渠道');const sinceDate=value.sinceDate?new Date(value.sinceDate).toISOString():dateRangeStart(value.dateRange)?.toISOString()||null;const filterStatus=String(value.filterStatus||'');if(!['','accepted','pending','rejected','manual'].includes(filterStatus))throw Error('无效分类状态');const overseas=value.overseas==null||value.overseas===''?null:String(value.overseas);if(overseas!==null&&!['true','false'].includes(overseas))throw Error('无效资讯范围');return {sourceId,sinceDate,pendingOnly:value.pendingOnly===true,filterStatus,sourceType:String(value.sourceType||''),search:String(value.search||''),matchedTopic:String(value.matchedTopic||''),overseas,targeted:value.targeted===true};}
export function decideArticle(a,compiled){
 const content=textBody(a.mp_content??a.content),title=a.title||'';
 let decision=classifyRecord({title,content},compiled);
 if(a.manual_classify||a.classify_method==='manual'){
  const primary=canonicalTopic(a.matched_topic);
  decision={status:a.filter_status==='accepted'?'accepted':a.filter_status==='rejected'?'excluded':'unmatched',primary:a.filter_status==='accepted'?primary:null,topics:a.filter_status==='accepted'&&primary?[primary]:[],positive:[],negative:[],reason:a.reject_reason||'保留人工分类',method:'manual',manual:true,version:compiled.version};
 }
 return {decision,content,inputHash:digest([title,content]),ready:!!content,manual:!!decision.manual};
}
// Compare business classifications, not historical aliases. Manual decisions are immutable.
export function classificationChanged(article,decision){
 if(article.manual_classify||article.classify_method==='manual'||decision.manual)return false;
 const before=article.filter_status==='accepted'?'accepted':article.filter_status==='rejected'?'excluded':'unmatched';
 return before!==decision.status||(canonicalTopic(article.matched_topic)||null)!==(canonicalTopic(decision.primary)||null);
}
export async function articleRows(db,scope,lock=false,after=0){return (await db.query(`SELECT a.id,a.title,CASE WHEN i.id IS NULL THEN a.content ELSE NULL END content,a.link,a.source_id,a.published_at,a.filter_status,a.matched_topic,a.reject_reason,a.manual_classify,a.classify_method,s.name source_name,s.type source_kind,
 i.id item_id,i.subscription_id,i.payload->>'content' mp_content,i.classification mp_classification
 FROM public.articles a LEFT JOIN public.sources s ON s.id=a.source_id LEFT JOIN mp2rss.items i ON i.article_id=a.id
 WHERE ($1::integer IS NULL OR a.source_id=$1) AND ($2::timestamptz IS NULL OR a.published_at >= $2) AND (NOT $3::boolean OR a.filter_status='pending') AND a.id>$4
 AND ($5='' OR CASE WHEN $5='manual' THEN a.manual_classify ELSE a.filter_status=$5 END)
 AND ($6='' OR a.source_type=$6) AND ($7='' OR a.title LIKE '%'||$7||'%')
 AND ($8='' OR CASE WHEN $8='外网资讯' THEN s.is_overseas=true ELSE a.matched_topic=ANY($10::text[]) END)
 AND ($9::boolean IS NULL OR s.is_overseas=$9::boolean)
 ORDER BY a.id LIMIT 20 ${lock?'FOR UPDATE OF a':''}`,[scope.sourceId,scope.sinceDate,scope.pendingOnly,after,scope.filterStatus||'',scope.sourceType||'',scope.search||'',scope.matchedTopic||'',scope.overseas??null,topicAliases(scope.matchedTopic||'')])).rows;}
export async function* articleBatches(db,scope,lock=false){let after=0;while(true){const rows=await articleRows(db,scope,lock,after);if(!rows.length)return;yield rows;after=rows.at(-1).id;await new Promise(resolve=>setImmediate(resolve));}}
function addSummary(target,part){for(const key of Object.keys(part)){if(key==='samples')target.samples=[...target.samples,...part.samples].slice(0,12);else target[key]+=part[key];}return target;}
async function summarizeAll(db,scope,compiled){const result=summarize([],compiled);for await(const rows of articleBatches(db,scope))addSummary(result,summarize(rows,compiled));return result;}
export function summarize(rows,compiled){const summary={total:0,mp2rss:0,legacy:0,manual:0,changed:0,newlyAccepted:0,removed:0,accepted:0,excluded:0,candidate:0,missingBody:0,eligible:0};const samples=[];
 for(const a of rows){const {decision:d,ready,manual}=decideArticle(a,compiled);summary.total++;summary[a.item_id?'mp2rss':'legacy']++;if(manual)summary.manual++;summary[d.status==='accepted'?'accepted':d.status==='excluded'?'excluded':'candidate']++;if(!ready)summary.missingBody++;if(ready&&d.status==='accepted')summary.eligible++;
 const old=a.filter_status==='accepted'?'accepted':a.filter_status==='rejected'?'excluded':'unmatched';if(classificationChanged(a,d)){summary.changed++;if(samples.length<12)samples.push({id:a.id,title:a.title,before:old,after:d.status,topic:d.primary,reason:d.reason});}if(old!=='accepted'&&d.status==='accepted')summary.newlyAccepted++;if(old==='accepted'&&d.status!=='accepted')summary.removed++;
 }return {...summary,samples};}
export async function previewClassification(db,value){await initClassification(db);const scope=scopeOf(value),config=await currentRules(db),compiled=compileRules(config),token=digest([compiled.version,scope]);const cached=(await db.query("SELECT payload FROM classification.previews WHERE token=$1 AND created_at>now()-interval '5 minutes'",[token])).rows[0];if(cached)return cached.payload;
 const summary=await summarizeAll(db,scope,compiled);let intelligence={total:0,changed:0};if(!scope.targeted&&(await db.query("SELECT to_regclass('ocean_intel.documents') t")).rows[0].t){let after='';while(true){const rows=(await db.query('SELECT id,payload FROM ocean_intel.documents WHERE id>$1 ORDER BY id LIMIT 20',[after])).rows;if(!rows.length)break;for(const {payload:d} of rows){intelligence.total++;if(d.manual||d.industry?.manual)continue;const next=classifyRecord(d,compiled);if(next.status!==d.industry?.status||next.primary!==d.industry?.primary)intelligence.changed++;}after=rows.at(-1).id;}}
 const result={version:compiled.version,scope,...summary,intelligence:scope.targeted?null:intelligence,previewToken:token,previewedAt:new Date().toISOString()};await db.query('INSERT INTO classification.previews(token,version,scope,payload) VALUES($1,$2,$3,$4) ON CONFLICT(token) DO UPDATE SET payload=EXCLUDED.payload,created_at=now()',[token,compiled.version,scope,result]);return result;}
export async function enqueueClassification(pool,value){await initClassification(pool);const db=await pool.connect();try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(73201912)');const active=(await db.query("SELECT id FROM classification.jobs WHERE status IN ('queued','classifying','processing')")).rows[0];if(active)throw Error('已有历史处理任务 #'+active.id+'，请等待发布后再提交');
 const scope=scopeOf(value),config=await currentRules(db),compiled=compileRules(config);if(value.version!==compiled.version)throw Error('规则已变化，请重新预览影响范围');
 const preview=(await db.query("SELECT payload FROM classification.previews WHERE token=$1 AND version=$2 AND scope=$3::jsonb AND created_at>now()-interval '1 hour'",[value.previewToken,compiled.version,JSON.stringify(scope)])).rows[0]?.payload;if(!preview)throw Error('影响预览已过期，请重新预览');
 const job=(await db.query('INSERT INTO classification.jobs(version,config,scope,preview) VALUES($1,$2,$3,$4) RETURNING id,status',[compiled.version,config,scope,preview])).rows[0];await db.query('COMMIT');return {...job,preview};}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
export async function applyClassificationJob(pool){await initClassification(pool);const db=await pool.connect();let jobId;try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(73201910)');await db.query('SELECT pg_advisory_xact_lock(73201912)');
 const job=(await db.query("SELECT * FROM classification.jobs WHERE status IN ('queued','classifying') ORDER BY id LIMIT 1 FOR UPDATE")).rows[0];if(!job){await db.query('COMMIT');return null;}
 jobId=job.id;
 await db.query("UPDATE classification.jobs SET status='classifying',started_at=coalesce(started_at,now()),error=NULL WHERE id=$1",[job.id]);
 const compiled=compileRules(job.config),result=summarize([],compiled);
 for await(const rows of articleBatches(db,job.scope,true)){addSummary(result,summarize(rows,compiled));
 for(const a of rows){const evaluated=decideArticle(a,compiled),inputHash=evaluated.inputHash,d=await queueSemantic(db,{id:a.id,title:a.title,content:a.mp_content??a.content},compiled,evaluated.decision,job.id),status=d.status==='accepted'?'accepted':d.status==='excluded'?'rejected':'pending';
  await db.query('INSERT INTO classification.audit(job_id,article_id,before_state,after_state) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[job.id,a.id,{status:a.filter_status,topic:a.matched_topic,method:a.classify_method,mp:a.mp_classification},d]);
  await db.query('INSERT INTO classification.articles(article_id,classification,input_hash,job_id) VALUES($1,$2,$3,$4) ON CONFLICT(article_id) DO UPDATE SET classification=EXCLUDED.classification,input_hash=EXCLUDED.input_hash,job_id=EXCLUDED.job_id,updated_at=now()',[a.id,d,inputHash,job.id]);
  if(!d.manual)await db.query(`UPDATE public.articles SET filter_status=$2::text,matched_topic=$3,reject_reason=$4,classify_method='keyword',matched_keywords_json=$5,updated_at=now(),vectorized=CASE WHEN $2='accepted' THEN vectorized ELSE false END WHERE id=$1 AND NOT manual_classify AND classify_method IS DISTINCT FROM 'manual'`,[a.id,status,d.primary,d.status==='excluded'?textSlice([d.reason,...d.negative.map(k=>k.keyword)].join('：'),0,255):null,JSON.stringify([...d.positive.flatMap(p=>p.keywords),...d.negative].map(k=>({keyword:k.keyword,source:k.field==='标题'?'title':k.field==='正文'?'content':'group'})))]);
  if(status!=='accepted')await db.query('DELETE FROM public.article_chunks WHERE article_id=$1',[a.id]);
  if(a.item_id)await db.query('UPDATE mp2rss.items SET classification=$2,updated_at=now() WHERE id=$1',[a.item_id,d]);
 }}
 result.pendingSemantic=Number((await db.query("SELECT count(*) n FROM classification.semantic_queue WHERE job_id=$1 AND status IN ('pending','failed','running')",[job.id])).rows[0].n);
 await db.query("UPDATE classification.jobs SET status='processing',result=$2 WHERE id=$1",[job.id,result]);await db.query('COMMIT');return job;
 }catch(e){await db.query('ROLLBACK');if(jobId)await db.query("UPDATE classification.jobs SET error=$2,started_at=coalesce(started_at,now()) WHERE id=$1",[jobId,'历史分类执行失败，已回滚，后台将重试（错误代码：'+(String(e.code||'CLASSIFICATION_FAILED').replace(/[^A-Z0-9_]/g,'').slice(0,40))+ '）。']);throw e;}finally{db.release();}}
export async function acknowledgeClassification(pool,data,isComplete){
 // Refresh classification totals after asynchronous semantic decisions.
 for(const mark of data.classificationJobs||[]){const counts=(await pool.query(`SELECT count(*) FILTER(WHERE classification->>'status'='accepted')::int accepted,count(*) FILTER(WHERE classification->>'status'='excluded')::int excluded,count(*) FILTER(WHERE classification->>'status'='unmatched')::int candidate FROM classification.articles WHERE job_id=$1`,[mark.id])).rows[0];await pool.query('UPDATE classification.jobs SET result=result || $2::jsonb WHERE id=$1',[mark.id,JSON.stringify(counts)]);}
 for(const mark of data.classificationJobs||[]){const docs=data.documents.filter(d=>mark.documentIds.includes(d.id)),eligible=docs.filter(d=>d.industry?.status==='accepted'&&!d.manual),pending=eligible.filter(d=>!isComplete(d));const semanticPending=Number((await pool.query("SELECT count(*) n FROM classification.semantic_queue WHERE job_id=$1 AND status IN ('pending','failed','running')",[mark.id])).rows[0].n);const result={pendingSemantic:semanticPending,published:true,documents:docs.length,extracted:eligible.length-pending.length,pendingExtraction:pending.length,failedExtraction:pending.filter(d=>d.autoExtraction?.status==='failed').length,missingBody:mark.missingBody};
 await pool.query("UPDATE classification.jobs SET status=$2,finished_at=now(),result=result || $3::jsonb,error=$4 WHERE id=$1 AND status IN ('processing','partial')",[mark.id,(pending.length||semanticPending)?'partial':'completed',JSON.stringify(result),pending.length?'分类和图表已发布；未完成的提取将按重试计划继续':null]);
 }
}
