import pg from 'pg';
import {createHash} from 'node:crypto';
import {textBody} from '../classification-jobs.mjs';
export const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const bodyFingerprint=record=>fingerprint([record.title||'',textBody(record.content||'')]);
const byUrl=rows=>new Map(rows.map(row=>[row.url||row.link,row]));
// Decode only the shared interface. Legacy payloads also contain very large
// HTML/checkpoint fields that are irrelevant to a read-only subsystem.
const documentColumns="\"versionId\" text,\"summarySourceHash\" text,\"autoExtraction\" jsonb,\"id\" text,\"url\" text,\"title\" text,\"titleZh\" text,\"content\" text,\"contentZh\" text,\"summaryZh\" text,\"sourceId\" text,\"language\" text,\"publishedAt\" text,\"translationType\" text,\"translationVersion\" text,\"translationModel\" text,\"titleTranslation\" text,\"contentKind\" text,\"evidenceAssets\" jsonb,extraction jsonb";
const documentPayload="jsonb_build_object('versionId',p.\"versionId\",'summarySourceHash',p.\"summarySourceHash\",'autoExtraction',p.\"autoExtraction\",'id',p.\"id\",'url',p.\"url\",'title',p.\"title\",'titleZh',p.\"titleZh\",'content',p.\"content\",'contentZh',p.\"contentZh\",'summaryZh',p.\"summaryZh\",'sourceId',p.\"sourceId\",'language',p.\"language\",'publishedAt',p.\"publishedAt\",'translationType',p.\"translationType\",'translationVersion',p.\"translationVersion\",'translationModel',p.\"translationModel\",'titleTranslation',p.\"titleTranslation\",'contentKind',p.\"contentKind\",'extraction',CASE WHEN pg_column_size(p.extraction)<2097152 THEN p.extraction ELSE NULL END,'evidenceAssets',CASE WHEN pg_column_size(p.\"evidenceAssets\")<1048576 THEN p.\"evidenceAssets\" ELSE '[]'::jsonb END)";
// This adapter has no HTTP/provider/model dependency. Its role has SELECT only.
export class SharedSource{
 constructor({url=process.env.LC_SOURCE_DATABASE_URL,pool}={}){
  if(!pool){const u=new URL(url);if(u.pathname!=='/knowledge_base'||u.username!=='lc_source_reader'||!['127.0.0.1','localhost'].includes(u.hostname))throw Error('SHARED_SOURCE_IDENTITY_REJECTED');}
  this.pool=pool||new pg.Pool({connectionString:url,max:1,connectionTimeoutMillis:3000,options:'-c default_transaction_read_only=on -c statement_timeout=3000 -c lock_timeout=500'});
  this.intelHeaders=new Map();this.intelIds=new Map();
 }
 async verify(){const r=(await this.pool.query("SELECT current_database() name,current_user role,current_setting('default_transaction_read_only') ro")).rows[0];if(r.name!=='knowledge_base'||r.role!=='lc_source_reader'||r.ro!=='on')throw Error('SHARED_SOURCE_NOT_READ_ONLY');}
 async index(){
  const q=async(sql,params)=>(await this.pool.query(sql,params)).rows;
  // Small headers avoid rereading all article bodies on every five-minute tick.
  const articles=await q('SELECT id,link AS url,source_id,updated_at::text revision FROM public.articles ORDER BY id');
  const items=await q('SELECT article_id,updated_at::text revision FROM mp2rss.items');
  const headers=await q('SELECT id,updated_at::text revision FROM ocean_intel.documents ORDER BY id');
  const dirty=headers.filter(h=>this.intelHeaders.get(h.id)?.revision!==h.revision);
  for(let n=0;n<dirty.length;n+=100){const ids=dirty.slice(n,n+100).map(h=>h.id);for(const row of await q("SELECT id,payload->>'url' url,updated_at::text revision FROM ocean_intel.documents WHERE id=ANY($1::text[])",[ids]))this.intelHeaders.set(row.id,row);}
  const intel=headers.map(h=>this.intelHeaders.get(h.id)).filter(Boolean);this.intelIds=new Map(intel.map(r=>[r.url,r.id]));
  const evidence=await q('SELECT url,updated_at::text revision FROM mp2rss.evidence_documents');
  const resources=await q("SELECT id,kind,source_hash,updated_at::text revision FROM model_ops.resources WHERE status='completed' ORDER BY id");
  const sources=await q('SELECT id,fakeid,name,alias,type,is_overseas FROM public.sources ORDER BY id');
  const intelligenceSources=await q("SELECT id,payload->>'name' name,payload->>'url' url,payload->>'method' method,payload->>'country' country,payload->>'level' level,payload->>'status' status FROM ocean_intel.sources ORDER BY id");
  const subscriptions=await q('SELECT id,source_id,payload,enabled,posts,articles,present,last_sync,status FROM mp2rss.subscriptions ORDER BY id');
  const metadataHead=(await q("SELECT payload->'_workspaceParts'->'fields' parts,payload->'ieaDatasets' iea,payload->'assetRegistries' registries,payload->'officialData' official FROM ocean_intel.runs WHERE id='current'"))[0];
  const metadataRows=await q("SELECT field,key,hash FROM ocean_intel.workspace_rows WHERE field IN ('series','reportCatalog') AND NOT deleted ORDER BY field,key");
  const metaRevision=fingerprint([metadataHead,metadataRows,intelligenceSources]);
  const sourceHash=fingerprint([sources,subscriptions,resources]),map=new Map(),ids=new Map(articles.map(a=>[a.id,a.url]));
  const add=(url,part)=>{if(!/^https?:\/\//i.test(url||''))return;const row=map.get(url)||{url,parts:[]};row.parts.push(part);map.set(url,row);};
  for(const a of articles)add(a.url,['article',a.id,a.revision]);
  for(const a of items)add(ids.get(a.article_id),['item',a.revision]);
  for(const a of intel)add(a.url,['intel',a.id,a.revision,'result-version-guard-v2']);
  for(const a of evidence)add(a.url,['evidence',a.revision,'result-version-guard-v2']);
  return {sources,subscriptions,intelligenceSources,metaRevision,entries:[...map.values()].map(r=>({url:r.url,fingerprint:fingerprint([r.parts.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),sourceHash])})).sort((a,b)=>a.url.localeCompare(b.url)),observedAt:new Date().toISOString()};
 }
 async read(urls){
  if(!urls.length)return [];
  if(urls.length>100)throw Error('SHARED_SOURCE_BATCH_TOO_LARGE');
  const records=[];
  for(let n=0;n<urls.length;n+=5)records.push(...await this.readSmall(urls.slice(n,n+5)));
  return records;
 }
 async readSmall(urls){
  const articles=(await this.pool.query('SELECT id,title,link,source_id,published_at FROM public.articles WHERE link=ANY($1::text[])',[urls])).rows;
  const items=(await this.pool.query(`SELECT i.article_id,i.subscription_id,to_jsonb(p) AS payload,i.updated_at FROM mp2rss.items i CROSS JOIN LATERAL jsonb_to_record(i.payload) AS p(key text,kind text,url text,title text,content text,summary text,hash text,language text,author text,"publishedAt" text,"contentStatus" text,source jsonb) WHERE article_id=ANY($1::int[]) ORDER BY updated_at ASC,i.id ASC`,[articles.map(a=>a.id)])).rows;
  const intel=byUrl((await this.pool.query(`SELECT p.url,${documentPayload} AS payload FROM ocean_intel.documents d CROSS JOIN LATERAL jsonb_to_record(d.payload) AS p(${documentColumns}) WHERE d.id=ANY($1::text[])`,[urls.map(u=>this.intelIds.get(u)).filter(Boolean)])).rows);
  const evidence=byUrl((await this.pool.query(`SELECT d.url,${documentPayload} AS payload FROM mp2rss.evidence_documents d CROSS JOIN LATERAL jsonb_to_record(d.payload) AS p(${documentColumns}) WHERE d.url=ANY($1::text[])`,[urls])).rows);
  const resources=(await this.pool.query("SELECT kind,source_hash,payload,result FROM model_ops.resources WHERE status='completed' AND payload->>'url'=ANY($1::text[])",[urls])).rows;
  const aa=byUrl(articles),ii=new Map(items.map(i=>[i.article_id,i]));
  // Rich HTML in the original article table averages almost 1 MB per row.
  // Reuse already-clean provider/evidence bodies before fetching that fallback.
  const missing=articles.filter(a=>!ii.get(a.id)?.payload?.content&&!evidence.get(a.link)?.payload?.content&&!a.content).map(a=>a.id);
  if(missing.length)for(const row of (await this.pool.query('SELECT id,content FROM public.articles WHERE id=ANY($1::int[])',[missing])).rows){const a=articles.find(a=>a.id===row.id);if(a)a.content=row.content;}
  const records=urls.map(url=>{
   const article=aa.get(url),item=ii.get(article?.id),marine=intel.get(url)?.payload,e=evidence.get(url)?.payload;
   const title=article?.title||e?.title||marine?.title||url;
   const content=textBody(e?.content||item?.payload?.content||article?.content||marine?.content||'');
   const record={url,title,content,sourceId:article?.source_id||null,sourceMarineId:marine?.sourceId||null,subscriptionId:item?.subscription_id||null,provider:item?.payload||null,publishedAt:article?.published_at||e?.publishedAt||marine?.publishedAt||null,language:e?.language||marine?.language||(/[\u4e00-\u9fff]/.test(title)?'zh':'en'),sourceArticleId:article?.id||null};
   const hash=bodyFingerprint(record);
   const matching=[e,marine].filter(p=>p&&bodyFingerprint(p)===hash);
   for(const p of matching){
    const translatedCurrent=!p.translationVersion||p.translationVersion===p.versionId;
    const summaryCurrent=!p.summarySourceHash||p.summarySourceHash===createHash('sha256').update(p.content||'').digest('hex');
    const extractionCurrent=!p.autoExtraction||p.autoExtraction.status==='completed'&&p.autoExtraction.versionId===p.versionId;
    const keys=['contentKind','evidenceAssets',...(translatedCurrent||summaryCurrent?['titleZh','titleTranslation']:[]),...(translatedCurrent?['contentZh','translationType','translationVersion','translationModel']:[]),...(summaryCurrent?['summaryZh']:[]),...(extractionCurrent?['extraction']:[])];
    for(const key of keys)if(p[key]!=null&&record[key]==null)record[key]=p[key];
   }
   const translated=resources.find(r=>r.kind==='translation'&&r.payload.url===url&&r.source_hash===fingerprint([title,content]));
   if(translated)Object.assign(record,translated.result);
   record.sourceBodyHash=hash;return record;
  });
  const assets=records.flatMap(r=>r.evidenceAssets||[]);
  if(assets.length){const results=(await this.pool.query("SELECT kind,source_hash,payload,result FROM model_ops.resources WHERE status='completed' AND kind='vision' AND payload->>'url'=ANY($1::text[])",[assets.map(a=>a.url)])).rows;for(const asset of assets){const r=results.find(r=>r.payload.url===asset.url&&r.source_hash===asset.sha256);if(r)Object.assign(asset,r.result);}}
  return records;
 }
 async metadata(){
  const root=(await this.pool.query("SELECT payload FROM ocean_intel.runs WHERE id='current'")).rows[0]?.payload||{};
  const out={};
  for(const field of ['series','assetRegistries','ieaDatasets','officialData','reportCatalog']){
   if(root._workspaceDelta?.fields?.includes(field))out[field]=(await this.pool.query('SELECT payload FROM ocean_intel.workspace_rows WHERE field=$1 AND NOT deleted ORDER BY position',[field])).rows.map(r=>JSON.parse(r.payload));
   else if(root._workspaceParts?.fields?.[field]){const text=(await this.pool.query('SELECT payload FROM ocean_intel.workspace_parts WHERE generation=$1 AND field=$2 ORDER BY part',[root._workspaceParts.generation,field])).rows.map(r=>r.payload).join('');out[field]=JSON.parse(text);}
   else if(root[field]!==undefined)out[field]=root[field];
  }
  return out;
 }
 close(){return this.pool.end();}
}
