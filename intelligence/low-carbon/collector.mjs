import fs from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns/promises';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {parseHTML} from 'linkedom';
import {Readability} from '@mozilla/readability';
import {XMLParser} from 'fast-xml-parser';
import {sharedRequest} from './shared-client.mjs';
import {baselineSources} from './sources.mjs';
import {normalize} from '../../server/integrations/mp2rss-client.mjs';
import {id,chunks} from '../core.mjs';
import {currentRules,digest,textBody,applyClassificationJob} from '../classification-jobs.mjs';
import {compileRules,classifyRecord} from '../industry-classification.mjs';
import {semanticDecision,processSemanticQueue,inputHash} from '../semantic-classification.mjs';
import {ruleExtract} from '../rules.mjs';
import {extractArticle,applyExtraction,extractionError} from '../auto-extract.mjs';
import {attachPublishedRules} from '../published-rules.mjs';
import {invalidateAudit} from '../classification-audit.mjs';
import {PostgresResearchRepository} from '../research/repositories.mjs';
import {publishWorkspace} from '../research/publish-workspace.mjs';
import {prioritizeLowCarbonRecords} from './priority.mjs';

const denied=ip=>/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)||ip==='39.96.24.170'||/^(::|f[cd]|fe[89ab])/i.test(ip);
export async function publicUrl(value){const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port)||u.hostname==='localhost')throw Error('UNSAFE_SOURCE_URL');const addresses=await dns.lookup(u.hostname,{all:true});if(!addresses.length||addresses.some(a=>denied(a.address)))throw Error('UNSAFE_SOURCE_ADDRESS');return u;}
export async function fetchPublic(value){let u=await publicUrl(value);for(let n=0;n<4;n++){
 const r=await fetch(u,{redirect:'manual',headers:{'User-Agent':'LowCarbonResearch/1.0 (public-source evidence collection)'},signal:AbortSignal.timeout(25000)});
 if(r.status>=300&&r.status<400){await r.body?.cancel();u=await publicUrl(new URL(r.headers.get('location'),u));continue;}
 if(!r.ok){await r.body?.cancel();throw Error('SOURCE_HTTP_'+r.status);}let size=0,buffers=[];for await(const c of r.body){size+=c.length;if(size>3*1024*1024)throw Error('SOURCE_TOO_LARGE');buffers.push(c);}return {url:u.href,text:Buffer.concat(buffers).toString('utf8')};
 }throw Error('SOURCE_REDIRECT_LIMIT');}
function dateValue(value){if(!value)return null;const d=new Date(value);return Number.isFinite(d.getTime())&&d.getTime()<=Date.now()+86400000?d.toISOString():null;}
function webpage({text,url},source){const {document}=parseHTML(text),meta=key=>document.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.getAttribute('content');
 const publishedAt=dateValue(meta('article:published_time')||meta('pubdate')||meta('PubDate')||meta('publishdate')||meta('PublishDate')||meta('date')||document.querySelector('time[datetime]')?.getAttribute('datetime'));
 const parsed=new Readability(document).parse();const title=textBody(parsed?.title||meta('og:title')||document.title||'');const content=textBody(parsed?.content||'');if(content.length<100)throw Error('SOURCE_BODY_UNAVAILABLE');
 return {url,title,content:content.slice(0,100000),publishedAt,source,language:/[\u4e00-\u9fff]/.test(title)?'zh':'en',publishedDateSource:publishedAt?'原站元数据':'原站未提供可解析发布日期'};}
async function rssRecords(source,limit){const {text}=await fetchPublic(source.url),parsed=new XMLParser({ignoreAttributes:false}).parse(text);let list=parsed.rss?.channel?.item||parsed.feed?.entry||[];if(!Array.isArray(list))list=[list];return list.slice(0,limit).map(item=>{const links=Array.isArray(item.link)?item.link:[item.link];const link=links.find(x=>x?.['@_rel']==='alternate')||links[0];const url=typeof link==='string'?link:link?.['@_href'];const raw=item['content:encoded']||item.content?.['#text']||item.content||item.description||item.summary||'';return {url,title:textBody(item.title?.['#text']||item.title),content:textBody(typeof raw==='string'?raw:''),publishedAt:dateValue(item.pubDate||item.published||item.updated),source,language:/[\u4e00-\u9fff]/.test(String(item.title))?'zh':'en'};}).filter(r=>r.url&&r.title);}

export async function createLowCarbonScheduler({store,dir,serial,client,auditPool}){
 const pool=store.pool,file=path.join(dir,'collection-status.json'),lock=path.join(process.env.LC_LOCK_DIR,'pipeline.lock');
 const enabled=process.env.INTEL_SCHEDULE==='true',intervalMs=6*3600000;
 let state={enabled,running:false,intervalHours:6,lastRun:null,nextRun:new Date(Date.now()+60000).toISOString(),steps:[],cursor:0};try{const saved=JSON.parse(await fs.readFile(file,'utf8'));state={...state,...saved,enabled,running:false};if(saved.running){state.result='interrupted';state.error='服务更新中断上次任务，等待独立重试';await pool.query("UPDATE mp2rss.jobs SET status='interrupted',finished_at=now(),error=$1 WHERE status='running'",[state.error]);}}catch(e){if(e.code!=='ENOENT')throw e;}
 let timer;const persist=async()=>{const tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(state));await fs.rename(tmp,file);};
 const arm=()=>{clearTimeout(timer);if(enabled){state.nextRun=new Date(Math.max(Date.now()+30000,Date.parse(state.nextRun)||0)).toISOString();timer=setTimeout(()=>void run(),Date.parse(state.nextRun)-Date.now());timer.unref();}};
 async function run({processOnly=false,sourceId,subscriptionId}={}){
  if(state.running)return false;state.running=true;let handle,job,appliedJob;
  try{
   handle=spawn('flock',['-n',lock,process.execPath,'-e','process.stdout.write("locked\\n");process.stdin.resume()'],{stdio:['pipe','pipe','ignore']});
   const acquired=await new Promise(resolve=>{handle.stdout.once('data',()=>resolve(true));handle.once('exit',()=>resolve(false));handle.once('error',()=>resolve(false));});
   if(!acquired)throw Error('LOW_CARBON_PIPELINE_BUSY');
   state={...state,running:true,runMode:processOnly?'processing':'collection',currentStep:'collecting',startedAt:new Date().toISOString(),error:null,steps:[]};await persist();
   job=(await pool.query("INSERT INTO mp2rss.jobs(action,target,status,started_at) VALUES($1,$2,'running',now()) RETURNING id",[processOnly?'process':'sync',subscriptionId||null])).rows[0];
   if(processOnly){state.currentStep='classifying';await persist();appliedJob=await applyClassificationJob(pool);}
   const records=[],sources=[],errors=[];
   if(!processOnly){
    const [subscriptions,rss]=await Promise.all([sharedRequest('/api/subscriptions').catch(()=>({unavailable:true})),sharedRequest('/api/rss/sources').catch(()=>({unavailable:true}))]);
    if(subscriptions.unavailable){errors.push({code:'SHARED_REGISTRY_UNAVAILABLE'});subscriptions.list=(await pool.query('SELECT id,payload,enabled,posts,articles,present FROM mp2rss.subscriptions')).rows;}
    if(rss.unavailable){errors.push({code:'SHARED_RSS_REGISTRY_UNAVAILABLE'});rss.list=store.data.sources.filter(s=>s.method==='rss').map(s=>({...s,id:s.id.replace('lc-rss-',''),alias:s.url}));}
    const registry=(subscriptions.list||[]).filter(s=>s.present!==false&&s.enabled!==false),all=registry.filter(s=>!subscriptionId||s.id===subscriptionId);
    if(!subscriptions.unavailable)await pool.query('UPDATE mp2rss.subscriptions SET present=false');
    for(const s of registry)await pool.query('INSERT INTO mp2rss.subscriptions(id,payload,enabled,posts,articles,present,checked_at) VALUES($1,$2,$3,$4,$5,true,now()) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,enabled=EXCLUDED.enabled,posts=EXCLUDED.posts,articles=EXCLUDED.articles,present=true,checked_at=now()',[s.id,s.payload,s.enabled!==false,!!s.posts,s.articles!==false]);
    const selected=subscriptionId?all:all.slice(state.cursor,state.cursor+12);state.cursor=all.length?(state.cursor+Math.max(selected.length,12))%all.length:0;
    for(const s of selected){const src=s.payload,source={id:'mp2rss_'+s.id,name:src.name,url:src.platform==='x'?'https://x.com/'+src.handle:'https://mp.weixin.qq.com/',method:'api',level:'S4',country:src.platform==='mp'?'CN':null};sources.push(source);
     try{for(const kind of [...(src.platform==='x'&&s.posts?['posts']:[]),'articles']){const route=src.platform==='mp'?`/open-api/subscriptions/${src.remoteId}/articles`:`/open-api/x/${src.remoteId}/${kind}`;const data=await sharedRequest('/provider'+route+'?page=1&pageSize=20');for(const raw of (data.items||[]).slice(0,12)){try{const item=normalize(src,kind,raw);records.push({...item,provider:item,subscriptionId:s.id,source});}catch{errors.push({sourceId:source.id,code:'PROVIDER_ITEM_INVALID'});}}}
      source.status='ready';await pool.query('UPDATE mp2rss.subscriptions SET last_sync=now(),status=$2,error=NULL WHERE id=$1',[s.id,'ready']);
     }catch{source.status='failed';errors.push({sourceId:source.id,code:'PROVIDER_UNAVAILABLE'});}source.checkedAt=new Date().toISOString();state.steps.push({name:source.name,status:source.status,documents:records.filter(r=>r.source.id===source.id).length});await persist();
    }
    const feeds=(rss.list||[]).filter(s=>s.method==='rss'&&(!sourceId||String(s.id)===String(sourceId))).slice(0,12);
    for(const s of feeds){const source={id:'lc-rss-'+s.id,name:s.name,url:s.alias||s.url,method:'rss',country:s.isOverseas?null:'CN',level:'S3'};sources.push(source);try{records.push(...await rssRecords(source,5));source.status='ready';}catch{source.status='failed';errors.push({sourceId:source.id,code:'RSS_UNAVAILABLE'});}source.checkedAt=new Date().toISOString();state.steps.push({name:source.name,status:source.status});await persist();}
    if(!sourceId&&!subscriptionId)for(const configured of baselineSources){const source={...configured};sources.push(source);try{records.push(webpage(await fetchPublic(source.url),source));source.status='ready';}catch{source.status='failed';errors.push({sourceId:source.id,code:'OFFICIAL_BODY_UNAVAILABLE'});}source.checkedAt=new Date().toISOString();state.steps.push({name:source.name,status:source.status});await persist();}
   }
   const config=await currentRules(pool),compiled=compileRules(config);let modelBudget=Number(process.env.LC_AI_BATCH_LIMIT||6),vectorBudget=16;
   state.currentStep='classifying';await persist();
   // Give the independent semantic queue a bounded share of the existing model
   // budget. Accepted-article extraction must not starve queued reviews forever.
   let semantic={completed:0,failed:0};
   if(client&&modelBudget>0){semantic=await processSemanticQueue(pool,{limit:Math.max(1,Math.floor(modelBudget/2)),client});modelBudget-=semantic.completed+semantic.failed;}
   if(processOnly||semantic.completed){
    const rows=(await pool.query(`SELECT a.*,s.fakeid,s.name source_name,s.alias source_url,s.is_overseas,c.classification saved_decision,c.input_hash saved_input_hash,i.payload provider,i.subscription_id
     FROM public.articles a JOIN public.sources s ON s.id=a.source_id LEFT JOIN classification.articles c ON c.article_id=a.id LEFT JOIN classification.semantic_queue q ON q.article_id=a.id LEFT JOIN LATERAL (SELECT x.payload,x.subscription_id FROM mp2rss.items x WHERE x.article_id=a.id ORDER BY x.updated_at DESC,x.id LIMIT 1) i ON true
     WHERE NOT a.manual_classify AND (($2::boolean AND ($1::bigint IS NULL OR c.job_id=$1)) OR (NOT $2::boolean AND q.status='completed' AND q.updated_at>=$3::timestamptz)) ORDER BY a.id DESC`,[appliedJob?.id||null,processOnly,state.startedAt])).rows;
    for(const r of rows){const extra={savedDecision:r.saved_decision,savedInputHash:r.saved_input_hash},existing=records.find(d=>d.url===r.link);if(existing)Object.assign(existing,extra);else records.push({...extra,url:r.link,title:r.title,content:textBody(r.provider?.content??r.content),provider:r.provider||null,subscriptionId:r.subscription_id||null,language:r.provider?.language||(/[\u4e00-\u9fff]/.test(r.title)?'zh':'en'),publishedAt:dateValue(r.published_at),source:{id:r.fakeid,name:r.source_name,url:r.source_url,country:r.is_overseas?null:'CN',method:'api',level:'S4'}});}
   }
   const prepared=[],{ordered,decisions}=await prioritizeLowCarbonRecords(records,r=>classifyRecord(r,compiled));
   for(const raw of ordered){
    if(!raw.url||!raw.title)continue;let record={...raw};const prior=store.data.documents.find(d=>d.url===record.url);const versionId=id('ver',digest([record.title,record.content,record.publishedAt]));
    const saved=record.savedDecision?.method==='llm'&&record.savedDecision.version===compiled.version&&record.savedInputHash===inputHash(record.title,record.content)?record.savedDecision:null;
    if(prior?.versionId===versionId&&prior.industry?.version===compiled.version&&!processOnly&&(!saved||prior.industry?.semantic?.reviewedAt===saved.semantic?.reviewedAt))continue;
    let decision=saved||decisions.get(raw);if(client&&modelBudget>0&&decision.status==='unmatched'&&decision.method!=='llm'&&record.content?.length>150){modelBudget--;try{decision=await semanticDecision(record,decision,compiled,{client});}catch{}}
    if(!processOnly&&record.content?.length<200&&decision.status==='accepted'&&!record.provider){try{record={...record,...webpage(await fetchPublic(record.url),record.source)};decision=classifyRecord(record,compiled);}catch{}}
    const doc={...prior,id:id('doc',record.url),versionId:id('ver',digest([record.title,record.content,record.publishedAt])),sourceId:record.source.id,url:record.url,title:record.title,titleZh:record.language==='zh'?record.title:prior?.titleZh||record.title,content:record.content||'',summaryZh:record.summary||record.content?.slice(0,300)||'',language:record.language||'zh',publishedAt:record.publishedAt||null,publishedDateSource:record.publishedDateSource||'来源提供',collectedAt:new Date().toISOString(),topic:decision.primary,industry:decision,classificationManaged:true,chunks:chunks(record.content||''),providerHash:record.provider?.hash};
    if(decision.status!=='accepted'||prior?.versionId!==doc.versionId)delete doc.embedding;
    let extraction=null;if(decision.status==='accepted'&&doc.content.length>=10){
     if(client&&modelBudget>0){modelBudget--;try{extraction=await extractArticle(client,doc);doc.pipelineMode='shared-ai';}catch(e){doc.aiError=extractionError(e).errorType;}}
     if(!extraction){extraction=ruleExtract(doc);doc.pipelineMode='rules';}
     if(client&&vectorBudget-->0){try{doc.embedding=(await client.embeddings.create({model:process.env.EMBEDDING_MODEL||'text-embedding-v4',input:doc.content.slice(0,5000),dimensions:1024})).data[0].embedding;}catch{}}
    }
    prepared.push({record,doc,decision,extraction});
   }
   state.currentStep='merging';await persist();
   await serial(async()=>{
    const snapshot=structuredClone(store.data);for(const s of sources){const at=snapshot.sources.findIndex(x=>x.id===s.id);if(at<0)snapshot.sources.push(s);else snapshot.sources[at]={...snapshot.sources[at],...s};}
    const classificationJob=(await pool.query("INSERT INTO classification.jobs(version,config,scope,status,preview,result,started_at,finished_at) VALUES($1,$2,$3,'completed','{}','{}',now(),now()) RETURNING *",[compiled.version,config,{trigger:processOnly?'low-carbon-reprocess':'low-carbon-collection'}])).rows[0];
    for(const {record,doc,decision,extraction} of prepared){
     const source=record.source;const sid=(await pool.query('INSERT INTO public.sources(fakeid,name,alias,type,is_overseas) VALUES($1,$2,$3,$4,$5) ON CONFLICT(fakeid) DO UPDATE SET name=EXCLUDED.name,alias=EXCLUDED.alias RETURNING id',[source.id,source.name,source.url,source.method==='rss'?'rss':'mp',source.country!=='CN'])).rows[0].id;
     const article=(await pool.query("INSERT INTO public.articles(title,link,content,source_id,source_type,published_at,filter_status,matched_topic,classify_method,download_status,vectorized) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(link) DO UPDATE SET title=EXCLUDED.title,content=EXCLUDED.content,published_at=EXCLUDED.published_at,filter_status=CASE WHEN articles.manual_classify THEN articles.filter_status ELSE EXCLUDED.filter_status END,matched_topic=CASE WHEN articles.manual_classify THEN articles.matched_topic ELSE EXCLUDED.matched_topic END,classify_method=CASE WHEN articles.manual_classify THEN articles.classify_method ELSE EXCLUDED.classify_method END,updated_at=now() RETURNING id,manual_classify",[doc.title,doc.url,doc.content,sid,record.subscriptionId?'mp2rss':source.method,doc.publishedAt,decision.status==='accepted'?'accepted':decision.status==='excluded'?'rejected':'pending',decision.primary,decision.method==='llm'?'llm':'keyword',doc.content?'downloaded':'pending',!!doc.embedding])).rows[0];
     if(article.manual_classify)continue;
     await pool.query('INSERT INTO classification.articles(article_id,classification,input_hash,job_id) VALUES($1,$2,$3,$4) ON CONFLICT(article_id) DO UPDATE SET classification=EXCLUDED.classification,input_hash=EXCLUDED.input_hash,job_id=EXCLUDED.job_id,updated_at=now()',[article.id,decision,digest([doc.title,doc.content]),classificationJob.id]);
     if(record.subscriptionId){const p=record.provider;await pool.query('INSERT INTO mp2rss.items(id,subscription_id,article_id,payload,content_hash,classification) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET article_id=EXCLUDED.article_id,payload=EXCLUDED.payload,content_hash=EXCLUDED.content_hash,classification=EXCLUDED.classification,updated_at=now()',[p.key,record.subscriptionId,article.id,p,p.hash,decision]);await pool.query('INSERT INTO mp2rss.versions(id,hash,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[p.key,p.hash,p]);}
     if(!snapshot.sources.some(s=>s.id===source.id))snapshot.sources.push(source);
     const old=snapshot.documents.find(d=>d.id===doc.id);if(old?.manual||old?.industry?.manual)continue;
     if(decision.status==='accepted'||old){snapshot.documents=snapshot.documents.filter(d=>d.id!==doc.id);snapshot.documents.push(doc);if(extraction)applyExtraction(snapshot,doc,extraction,new Date().toISOString());else if(decision.status!=='accepted')for(const k of ['events','relations','observations'])snapshot[k]=snapshot[k].filter(r=>r.documentId!==doc.id||r.manual||r.reviewedAt);}
     await pool.query('DELETE FROM public.article_chunks WHERE article_id=$1',[article.id]);await pool.query('UPDATE public.articles SET vectorized=$2 WHERE id=$1',[article.id,!!doc.embedding]);
     if(doc.embedding)await pool.query('INSERT INTO public.article_chunks(article_id,chunk_index,content,embedding) VALUES($1,0,$2,$3::vector)',[article.id,doc.content.slice(0,5000),JSON.stringify(doc.embedding)]);
    }
    snapshot.generatedAt=new Date().toISOString();snapshot.errors=errors;attachPublishedRules(snapshot,classificationJob);await store.import(snapshot);const release=await publishWorkspace(new PostgresResearchRepository(pool),snapshot,{trigger:'low-carbon-collection',completeness:errors.length?'partial':'complete'});state.releaseId=release.releaseId;
    if(appliedJob){const pending=Number((await pool.query("SELECT count(*) n FROM classification.semantic_queue WHERE job_id=$1 AND status IN ('pending','failed','running')",[appliedJob.id])).rows[0].n);await pool.query('UPDATE classification.jobs SET status=$3,finished_at=now(),result=result || $2::jsonb WHERE id=$1',[appliedJob.id,{published:true,releaseId:release.releaseId,pendingSemantic:pending,reviewedThisRun:semantic.completed},pending?'partial':'completed']);}
   });
   invalidateAudit(pool);invalidateAudit(auditPool);state.result=errors.length?'partial':'completed';state.lastRun=new Date().toISOString();state.steps=[{name:'独立采集与清洗',status:state.result,documents:prepared.length,errors:errors.length}];
   await pool.query("UPDATE mp2rss.jobs SET status=$2,finished_at=now(),result=$3 WHERE id=$1",[job.id,state.result,{accounts:sources.filter(s=>s.method==='api').length,inserted:prepared.length,failed:errors.length}]);
  }catch(e){state.result='failed';state.error=e.message==='LOW_CARBON_PIPELINE_BUSY'?'低碳采集或处理任务正在运行':'本轮未完成，已保存资料保留';console.error('Low-carbon collection:',e.code||e.message?.slice(0,120));if(job)await pool.query("UPDATE mp2rss.jobs SET status='failed',finished_at=now(),error=$2 WHERE id=$1",[job.id,state.error]).catch(()=>{});
  }finally{if(handle)handle.stdin.end();state.running=false;state.currentStep=null;state.nextRun=new Date(Date.now()+intervalMs).toISOString();await persist();arm();}
  return true;
 }
 arm();return {status:()=>({...state}),run,journal:null,close:()=>clearTimeout(timer)};
}
