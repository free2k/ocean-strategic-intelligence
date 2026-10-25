import {textSlice} from '../unicode-text.mjs';
import {id,chunks} from '../core.mjs';
import {classifyRecord,compileRules} from '../industry-classification.mjs';
import {currentRules,textBody} from '../classification-jobs.mjs';
import {ruleExtract} from '../rules.mjs';
import {applyExtraction} from '../auto-extract.mjs';
import {attachPublishedRules} from '../published-rules.mjs';
import {PostgresResearchRepository} from '../research/repositories.mjs';
import {publishWorkspace} from '../research/publish-workspace.mjs';
import {fingerprint} from './shared-source.mjs';
import {preserveImportedData} from '../data-provenance.mjs';
export const projectionSchema=`CREATE SCHEMA IF NOT EXISTS lc_shared;
 CREATE TABLE IF NOT EXISTS lc_shared.projections(url text PRIMARY KEY,source_fingerprint text NOT NULL,rule_version text NOT NULL,document jsonb NOT NULL,source jsonb NOT NULL,classification jsonb NOT NULL,provider jsonb,subscription_id text,updated_at timestamptz DEFAULT now());
 ALTER TABLE lc_shared.projections ADD COLUMN IF NOT EXISTS audited_fingerprint text;
 CREATE TABLE IF NOT EXISTS lc_shared.body_versions(url text NOT NULL,version_id text NOT NULL,document jsonb NOT NULL,created_at timestamptz DEFAULT now(),PRIMARY KEY(url,version_id));
 CREATE TABLE IF NOT EXISTS lc_shared.state(id text PRIMARY KEY,payload jsonb NOT NULL,updated_at timestamptz DEFAULT now());`;
const memory=stage=>{if(process.env.LC_MEMORY_TRACE==='true'){const {rss,heapUsed,external}=process.memoryUsage();console.log('shared-memory',JSON.stringify({stage,rss,heapUsed,external}));}};
const empty=()=>({sources:[],documents:[],events:[],entities:[],relations:[],observations:[],evidence:[],series:[],assetRegistries:{},errors:[]});
export function projectRecord(record,source,compiled,previous=null){
 const sameBodyAndRules=previous?.rule_version===compiled.version&&previous.document?.sharedSource?.bodyHash===record.sourceBodyHash;
 const industry=sameBodyAndRules?previous.classification:classifyRecord(record,{...compiled,summaryOnly:true}),versionId=id('ver',record.sourceBodyHash);
 const document={id:id('doc',record.url),versionId,sourceId:source.id,url:record.url,title:record.title,titleZh:record.titleZh||record.title,content:record.content,contentZh:record.contentZh,summaryZh:record.summaryZh||textSlice(record.content,0,300),language:record.language,publishedAt:record.publishedAt,collectedAt:new Date().toISOString(),publishedDateSource:record.publishedAt?'共享来源原始发布日期':'未提供',industry,topic:industry.primary,classificationManaged:true,chunks:chunks(textSlice(record.content,0,5000)),providerHash:record.provider?.hash,sharedSource:{articleId:record.sourceArticleId,bodyHash:record.sourceBodyHash},pipelineMode:'shared-results-local-rules',translationType:record.translationType||(record.language==='zh'?'中文原文':'共享译文尚无匹配结果，原文可用'),evidenceAssets:record.evidenceAssets||[]};
 for(const key of ['translationVersion','translationModel','titleTranslation','contentKind','embedding'])if(record[key]!==undefined)document[key]=record[key];
 // A reused extraction must match this exact body. Its topic is always recalculated locally.
 let extraction=record.extraction;
 if(!extraction&&sameBodyAndRules&&previous.document.localExtractionNotice&&['publishedAt','titleZh','summaryZh','contentZh'].every(k=>(previous.document[k]||null)===(document[k]||null))){extraction=previous.document.extraction;document.localExtractionNotice=previous.document.localExtractionNotice;}
 if(industry.status!=='accepted')extraction={entities:[],events:[],relations:[],observations:[],evidence:[],rejected:[]};
 else if(!extraction||!['entities','events','relations','observations','evidence'].every(k=>Array.isArray(extraction[k]))||extraction.evidence.some(e=>!textBody(document.content).replace(/\s+/g,' ').includes(String(e.quote||'').replace(/\s+/g,' ')))){extraction=ruleExtract({...document,content:textSlice(document.content,0,12000)});document.localExtractionNotice='实体与关系为原文前12000字的本地规则线索，非模型全文分析；完整正文和全文检索仍可用。';}
 else {extraction=structuredClone(extraction);for(const key of ['events','relations','observations','evidence'])for(const row of extraction[key]){row.documentId=document.id;if(row.versionId)row.versionId=versionId;}for(const event of extraction.events)event.topic=industry.primary;}
 document.extraction=extraction;document.localExtractionMethod=record.extraction===undefined?'local-rules':'shared-or-local-validated';
 return {document,source,classification:industry,provider:record.provider?{...record.provider,content:record.content,publishedAt:record.publishedAt,contentStatus:record.content?'complete':'pending_body',titleZh:record.titleZh,contentZh:record.contentZh,bodySource:'shared-normalized-body'}:null,subscriptionId:record.subscriptionId};
}
export function projectionSnapshot(previous,rows,metadata,config){
 const next={...empty(),...metadata,generatedAt:new Date().toISOString(),appId:'low-carbon',window:{since:'2000-01-01',until:new Date().toISOString().slice(0,10)}};
 const sources=new Map();
 for(const row of rows){const doc=structuredClone(row.document);sources.set(row.source.id,row.source);if(doc.industry.status!=='accepted')continue;applyExtraction(next,doc,doc.extraction,new Date().toISOString());doc.content=textSlice(doc.content,0,5000);const missing=[...new Set((doc.extraction.evidence||[]).map(e=>e.quote).filter(q=>q&&!doc.content.includes(q)))];if(missing.length)doc.content+='\n\n【共享原文引用片段；全文见文档入口】\n'+missing.join('\n\n');if(doc.contentZh)doc.contentZh=textSlice(doc.contentZh,0,5000);doc.chunks=[];delete doc.extraction;delete doc.embedding;doc.fullBodyAvailable=true;next.documents.push(doc);}
 next.sources=[...sources.values()];
 const old=previous||empty(),manualIds=new Set(old.documents.filter(d=>d.manual||d.industry?.manual).map(d=>d.id)),manualSources=new Set(old.documents.filter(d=>manualIds.has(d.id)).map(d=>d.sourceId));
 for(const key of ['documents','sources','events','entities','relations','observations','evidence']){const map=new Map(next[key].map(r=>[r.id,r]));for(const row of old[key]||[])if(row.manual||row.reviewedAt||manualIds.has(row.id)||manualIds.has(row.documentId)||key==='sources'&&manualSources.has(row.id))map.set(row.id,row);next[key]=[...map.values()];}
 const compiled=compileRules(config);next.industryRuleConfig=config;next.industryRuleVersion=compiled.version;
 // Workbook values are shared facts; their marine topic assignments are not.
 if(next.ieaDatasets){next.ieaDatasets={...next.ieaDatasets,datasets:Object.fromEntries(Object.entries(next.ieaDatasets.datasets||{}).map(([key,dataset])=>{const records=(dataset.records||[]).map(r=>{const context=[r.scopeEvidence||[r.technology,r.section,r.metric].filter(Boolean).join(' '),dataset.kind==='ccus'?'CCUS 碳捕集、运输与封存项目登记':''].join(' ');const decision=classifyRecord({title:r.object||r.objectZh||'',content:context},{...compiled,summaryOnly:true});const {scopeEvidence,classification,...facts}=r;return {...facts,classification:Object.fromEntries(['status','primary','topics','version','method','reason'].map(k=>[k,decision[k]]))};});return [key,{...dataset,records,counts:Object.fromEntries(['accepted','unmatched','excluded'].map(status=>[status,records.filter(r=>r.classification.status===status).length]))}];}))};}
 next.reportCatalog=(next.reportCatalog||[]).map(r=>({...r,industry:classifyRecord({title:r.title||r.name||'',content:r.summary||r.description||''},{...compiled,summaryOnly:true})})).filter(r=>r.industry.status==='accepted').map(r=>({...r,topic:r.industry.primary}));
 for(const s of next.series||[]){s.industry=classifyRecord({title:s.name,content:[s.note,s.classificationContext,...(s.keywords||[])].join(' ')},compiled);s.topic=s.industry.primary;}
 next.series=(next.series||[]).filter(s=>s.industry.status==='accepted');
 for(const [key,r]of Object.entries(next.assetRegistries||{})){r.industry=classifyRecord({title:r.name||key,content:[r.classificationContext,r.note].join(' ')},compiled);if(r.industry.status!=='accepted')delete next.assetRegistries[key];}
 return preserveImportedData(next,old);
}
export async function updateProjection({source,store}){
 memory('before-index');
 const pool=store.pool,index=await source.index(),config=await currentRules(pool),compiled=compileRules(config);
 memory('after-index');
 const publicationHash=fingerprint([index.entries,compiled.version,index.metaRevision,'shared-projection-v3']);
 const cursor=(await pool.query("SELECT payload FROM lc_shared.state WHERE id='cursor'")).rows[0]?.payload;
 const prior=new Map((await pool.query('SELECT url,source_fingerprint,rule_version FROM lc_shared.projections')).rows.map(r=>[r.url,r]));
 const changed=index.entries.filter(e=>prior.get(e.url)?.source_fingerprint!==e.fingerprint||prior.get(e.url)?.rule_version!==compiled.version);
 const sourceMap=new Map(index.sources.map(s=>[s.id,{id:'shared_src_'+s.id,name:s.name,url:s.alias||'',method:s.type||'rss',country:s.is_overseas?null:'CN',status:'ready',shared:true}]));
 const intelligenceSources=new Map((index.intelligenceSources||[]).map(s=>[s.id,{...s,id:id('shared_src',s.id),shared:true}]));
 const metadataSources=[...intelligenceSources.values()];
 if(metadataSources.length)await pool.query("UPDATE lc_shared.projections p SET source=m.payload FROM jsonb_to_recordset($1::jsonb) AS m(id text,payload jsonb) WHERE p.source->>'id'=m.id AND p.source IS DISTINCT FROM m.payload",[JSON.stringify(metadataSources.map(s=>({id:s.id,payload:s})))]);
 for(let offset=0;offset<changed.length;offset+=100){
  const batch=changed.slice(offset,offset+100);
  for(let part=0;part<batch.length;part+=5){
  const group=batch.slice(part,part+5),records=await source.read(group.map(e=>e.url));
  const cached=new Map((await pool.query('SELECT url,document,classification,rule_version FROM lc_shared.projections WHERE url=ANY($1::text[])',[group.map(e=>e.url)])).rows.map(r=>[r.url,r]));
  for(let i=0;i<records.length;i++){
   const record=records[i],s=sourceMap.get(record.sourceId)||intelligenceSources.get(record.sourceMarineId)||{id:id('shared_src',record.sourceMarineId||record.url),name:record.sourceMarineId||new URL(record.url).hostname,url:new URL(record.url).origin,method:'shared',status:'ready',shared:true};
   const p=projectRecord(record,s,compiled,cached.get(record.url));
   if(p.classification.status==='accepted')await pool.query('INSERT INTO lc_shared.body_versions(url,version_id,document) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[record.url,p.document.versionId,p.document]);
   await pool.query(`INSERT INTO lc_shared.projections(url,source_fingerprint,rule_version,document,source,classification,provider,subscription_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT(url) DO UPDATE SET source_fingerprint=EXCLUDED.source_fingerprint,rule_version=EXCLUDED.rule_version,document=EXCLUDED.document,source=EXCLUDED.source,classification=EXCLUDED.classification,provider=EXCLUDED.provider,subscription_id=EXCLUDED.subscription_id,updated_at=now()`,[record.url,group[i].fingerprint,compiled.version,p.document,p.source,p.classification,p.provider,p.subscriptionId]);
  }
  }
  await pool.query("UPDATE lc_shared.state SET payload=payload||$1::jsonb,updated_at=now() WHERE id='status'",[{prepared:Math.min(offset+100,changed.length),total:changed.length}]);
 }
 // Membership is reconciled too: timestamp cursors alone miss physical deletions.
 const alive=index.entries.map(e=>e.url),aliveSet=new Set(alive),removed=[...prior.keys()].some(u=>!aliveSet.has(u));
 if(!changed.length&&!removed&&cursor?.publicationHash===publicationHash){await pool.query("INSERT INTO lc_shared.state(id,payload) VALUES('status',$1) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()",[{enabled:true,running:false,mode:'shared',lastRun:index.observedAt,nextRun:new Date(Date.now()+300000).toISOString(),result:'unchanged',documents:store.data.documents.length,modelCalls:0}]);return {unchanged:true};}
 const rows=[];let after='';
 for(;;){const page=(await pool.query("SELECT url,document,source,classification FROM lc_shared.projections WHERE classification->>'status'='accepted' AND url=ANY($1::text[]) AND url>$2 ORDER BY url LIMIT 20",[alive,after])).rows;if(!page.length)break;for(const row of page){const d=row.document;if(d.localExtractionMethod==='local-rules'&&!d.localExtractionNotice){d.extraction=ruleExtract({...d,content:textSlice(d.content,0,12000)});d.localExtractionNotice='实体与关系为原文前12000字的本地规则线索，非模型全文分析；完整正文和全文检索仍可用。';d.chunks=chunks(textSlice(d.content,0,5000));await pool.query('UPDATE lc_shared.projections SET document=$2 WHERE url=$1',[row.url,d]);}d.content=textSlice(d.content,0,5000);if(d.contentZh)d.contentZh=textSlice(d.contentZh,0,5000);d.chunks=[];delete d.embedding;rows.push(row);}after=page.at(-1).url;}
 global.gc?.();
 memory('before-metadata');
 const metadata=await source.metadata();memory('after-metadata');
 // Publication has succeeded before a deleted source is removed from the local cache.
 await store.refresh();
 const snapshot=projectionSnapshot(store.data,rows,metadata,config);memory('after-snapshot');
 rows.length=0;for(const key of Object.keys(metadata))delete metadata[key];
 global.gc?.();
 snapshot.sources=[...new Map([...sourceMap.values(),...metadataSources,...snapshot.sources].map(s=>[s.id,s])).values()];
 const queued=(await pool.query("SELECT id FROM classification.jobs WHERE status='queued' ORDER BY id LIMIT 1")).rows[0];
 const job=queued?(await pool.query("UPDATE classification.jobs SET status='processing',version=$2,config=$3,scope=scope||$4::jsonb,started_at=now() WHERE id=$1 RETURNING *",[queued.id,compiled.version,config,{trigger:'shared-local-projection'}])).rows[0]:(await pool.query("INSERT INTO classification.jobs(version,config,scope,status,preview,result,started_at) VALUES($1,$2,$3,'processing','{}','{}',now()) RETURNING *",[compiled.version,config,{trigger:'shared-local-projection'}])).rows[0];
 attachPublishedRules(snapshot,job);
 memory('before-import');await store.import(snapshot);memory('after-import');
 global.gc?.();
 // Frozen research retains every cited original quote. Full versions remain in
 // body_versions; the live list does not need thousands of full article bodies.
 const proofs=new Map();for(const e of store.data.evidence){const quotes=proofs.get(e.documentId)||[];quotes.push(e.quote);proofs.set(e.documentId,quotes);}
 const researchData={...store.data,documents:store.data.documents.map(d=>{const missing=(proofs.get(d.id)||[]).filter(q=>q&&!d.content.includes(q));return missing.length?{...d,content:d.content+'\n\n【共享原文引用片段；完整正文见原始版本】\n'+[...new Set(missing)].join('\n\n')}:d;})};
 memory('before-research');
 const release=await publishWorkspace(new PostgresResearchRepository(pool,{cacheBytes:0}),researchData,{trigger:'shared-local-projection',completeness:'complete'});
 memory('after-research');
 // Populate the local audit ledger only. Original article flags are never written.
 for(const s of index.subscriptions){const src=sourceMap.get(s.source_id);let sourceId=null;if(src){sourceId=(await pool.query('INSERT INTO public.sources(fakeid,name,alias,type,is_overseas) VALUES($1,$2,$3,$4,$5) ON CONFLICT(fakeid) DO UPDATE SET name=EXCLUDED.name,alias=EXCLUDED.alias RETURNING id',[src.id,src.name,src.url,src.method,src.country!=='CN'])).rows[0].id;}await pool.query('INSERT INTO mp2rss.subscriptions(id,source_id,payload,enabled,posts,articles,present,last_sync,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET source_id=EXCLUDED.source_id,payload=EXCLUDED.payload,enabled=EXCLUDED.enabled,posts=EXCLUDED.posts,articles=EXCLUDED.articles,present=EXCLUDED.present,last_sync=EXCLUDED.last_sync,status=EXCLUDED.status',[s.id,sourceId,s.payload,s.enabled,s.posts,s.articles,s.present,s.last_sync,s.status]);}
 for(;;){
 const auditRows=(await pool.query("SELECT * FROM lc_shared.projections WHERE url=ANY($1::text[]) AND audited_fingerprint IS DISTINCT FROM source_fingerprint||':'||rule_version ORDER BY url LIMIT 20",[alive])).rows;
 if(!auditRows.length)break;
 for(const row of auditRows){
  const d=row.document,c=row.classification,s=row.source;
  const sid=(await pool.query('INSERT INTO public.sources(fakeid,name,alias,type,is_overseas) VALUES($1,$2,$3,$4,$5) ON CONFLICT(fakeid) DO UPDATE SET name=EXCLUDED.name RETURNING id',[s.id,s.name,s.url,s.method,s.country!=='CN'])).rows[0].id;
  const article=(await pool.query("INSERT INTO public.articles(title,link,content,source_id,source_type,published_at,filter_status,matched_topic,classify_method,download_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'keyword',$9) ON CONFLICT(link) DO UPDATE SET title=EXCLUDED.title,content=EXCLUDED.content,published_at=EXCLUDED.published_at,filter_status=CASE WHEN articles.manual_classify THEN articles.filter_status ELSE EXCLUDED.filter_status END,matched_topic=CASE WHEN articles.manual_classify THEN articles.matched_topic ELSE EXCLUDED.matched_topic END,updated_at=now() RETURNING id,manual_classify",[d.title,d.url,d.content,sid,row.subscription_id?'mp2rss':'shared',d.publishedAt,c.status==='accepted'?'accepted':c.status==='excluded'?'rejected':'pending',c.primary,d.content?'downloaded':'pending'])).rows[0];
  if(article.manual_classify){await pool.query("UPDATE lc_shared.projections SET audited_fingerprint=source_fingerprint||':'||rule_version WHERE url=$1",[d.url]);continue;}
  await pool.query('INSERT INTO classification.articles(article_id,classification,input_hash,job_id) VALUES($1,$2,$3,$4) ON CONFLICT(article_id) DO UPDATE SET classification=EXCLUDED.classification,input_hash=EXCLUDED.input_hash,job_id=EXCLUDED.job_id,updated_at=now()',[article.id,c,fingerprint([d.title,d.content]),job.id]);
  if(row.provider&&index.subscriptions.some(s=>s.id===row.subscription_id)){const p=row.provider;await pool.query('INSERT INTO mp2rss.items(id,subscription_id,article_id,payload,content_hash,classification) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,classification=EXCLUDED.classification,updated_at=now()',[p.key||id('shared_item',d.url),row.subscription_id,article.id,p,p.hash||d.sharedSource.bodyHash,c]);}
  await pool.query("UPDATE lc_shared.projections SET audited_fingerprint=source_fingerprint||':'||rule_version WHERE url=$1",[d.url]);
 }
 }
 await pool.query("UPDATE public.articles SET filter_status='rejected',reject_reason='共享来源已删除',updated_at=now() WHERE source_type IN ('shared','mp2rss') AND NOT(link=ANY($1::text[])) AND NOT manual_classify AND filter_status<>'rejected'",[alive]);
 await pool.query("UPDATE classification.articles c SET classification=jsonb_build_object('status','excluded','primary',null,'topics','[]'::jsonb,'reason','共享来源已删除','method','rules','version',$2::text),updated_at=now() FROM public.articles a WHERE a.id=c.article_id AND a.reject_reason='共享来源已删除' AND NOT(a.link=ANY($1::text[]))",[alive,compiled.version]);
 await pool.query('DELETE FROM lc_shared.projections WHERE NOT(url=ANY($1::text[]))',[alive]);
 await pool.query("UPDATE classification.jobs SET status='completed',finished_at=now(),result=$2 WHERE id=$1 OR status='queued'",[job.id,{published:true,releaseId:release.releaseId,documents:snapshot.documents.length,modelCalls:0}]);
 const status={enabled:true,running:false,mode:'shared',lastRun:index.observedAt,nextRun:new Date(Date.now()+300000).toISOString(),result:'completed',documents:snapshot.documents.length,sharedRecords:alive.length,updated:changed.length,releaseId:release.releaseId,modelCalls:0};
 await pool.query("INSERT INTO lc_shared.state(id,payload) VALUES('status',$1) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()",[status]);
 await pool.query("INSERT INTO lc_shared.state(id,payload) VALUES('cursor',$1) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()",[{publicationHash,observedAt:index.observedAt}]);
 return status;
}
