import {readWorkspaceClient,writeWorkspace} from './workspace-storage.mjs';
import {textSlice} from './unicode-text.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {topics,countries} from './core.mjs';
import {canonicalTopic} from './industry-topics.mjs';
import {classifyRecord,classifySnapshot,compileRules} from './industry-classification.mjs';
import {snapshotRules} from './published-rules.mjs';
import {unifiedIEA} from './iea-quant.mjs';
import {dataOrigin,originNames} from './data-provenance.mjs';
import {serveInsightImport} from './insight-import.mjs';

export class DataError extends Error{constructor(message,status=400){super(message);this.status=status;}}
// jsonb normalizes object key order; revisions must survive a database round-trip.
const hash=value=>createHash('sha256').update(JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)).digest('hex');
const keyOf=parts=>Buffer.from(JSON.stringify(parts)).toString('base64url');
const arrays=['documents','observations','events','entities','relations','evidence','sources'];
export const dataKinds=[['documents','文章资料'],['observations','文章指标'],['statistics','统计记录'],['registries','登记记录'],['official','官方数据集'],['events','事件'],['entities','实体'],['relations','关系'],['evidence','原文证据'],['sources','来源渠道'],['series','统计序列'],['reports','报告索引'],['candidates','候选线索']].map(([id,name])=>({id,name}));
const fields={
 documents:['title','titleZh','summaryZh','publishedAt','topic','industry'],
 observations:['name','subject','rawValue','unit','nature','period','qualifier','status','countries','reviewNote'],
 statistics:['value','sourceUrl','partial'],
 registries:['title','project','status','type','authorization','resource','effectiveYear','lessee','operator','capacityMW','technology','region','publicationDate','abstract'],
 official:['object','objectZh','metric','value','unit','nature','period','status','statusZh','country','countryCode','projectType','technology','scenario','scenarioZh','classification'],
 events:['title','summary','type','topic','status','eventDate','publishedAt','countries','dateBasis','reviewNote'],
 entities:['name','nameZh','type'],relations:['type','status','reviewNote'],evidence:['quote','quoteZh','start'],
 sources:['name','scope','level','country','status'],series:['name','unit','note','topic','nature','country','frequency'],
 reports:['label','checkedAt'],candidates:['title','reason','status','publishedAt']
};
function descriptor(kind,row,parts,path,context={}){return {kind,key:keyOf(parts),row,path,context};}
export function* records(data,kind){
 if(arrays.includes(kind)){for(const row of data[kind]||[])yield descriptor(kind,row,[row.id],[kind],{});return;}
 if(kind==='series'||kind==='statistics'){for(const s of data.series||[]){const context={dataset:s.name,sourceId:s.sourceId,topic:s.topic,unit:s.unit,country:s.country,sourceUrl:s.sourceUrl,ingestion:s.ingestion};if(kind==='series')yield descriptor(kind,s,[s.id],['series'],context);else for(const row of s.rows||[])yield descriptor(kind,row,[s.id,row.period],['series',s.id,'rows'],context);}return;}
 if(kind==='registries'){for(const [id,s]of Object.entries(data.assetRegistries||{}))for(const row of s.rows||[])yield descriptor(kind,row,[id,String(row.id||row.lease)],['assetRegistries',id,'rows'],{dataset:s.name||id,sourceId:s.sourceId||id,topic:s.topic||(id==='boem'?'海上风电':''),country:s.country||(id==='boem'?'US':null),sourceUrl:s.sourceUrl});return;}
 if(kind==='official'){for(const [id,s]of Object.entries(data.ieaDatasets?.datasets||{}))for(const row of s.records||[])yield descriptor(kind,row,[id,row.id],['ieaDatasets','datasets',id,'records'],{dataset:s.name||row.filename,sourceId:row.sourceId,sourceUrl:row.sourceUrl});return;}
 if(kind==='reports'){for(const row of data.reportCatalog||[])yield descriptor(kind,row,[row.sourceId,row.url],['reportCatalog']);return;}
 if(kind==='candidates'){for(const [id,row]of Object.entries(data.sourceCandidates||{}))yield descriptor(kind,row,[id],['sourceCandidates',id]);}
}
function findRecord(data,kind,key){return [...records(data,kind)].find(r=>r.key===key);}
function containers(data,path){
 if(path[0]==='series'&&path.length>1){const series=data.series||[],i=series.findIndex(s=>s.id===path[1]);if(i<0)return null;const s={...series[i],rows:[...(series[i].rows||[])]};data.series=[...series];data.series[i]=s;return s.rows;}
 if(path[0]==='assetRegistries'){const s=data.assetRegistries?.[path[1]];if(!s)return null;data.assetRegistries={...data.assetRegistries,[path[1]]:{...s,rows:[...s.rows]}};return data.assetRegistries[path[1]].rows;}
 if(path[0]==='ieaDatasets'){const s=data.ieaDatasets?.datasets?.[path[2]];if(!s)return null;data.ieaDatasets={...data.ieaDatasets,datasets:{...data.ieaDatasets.datasets,[path[2]]:{...s,records:[...s.records]}}};return data.ieaDatasets.datasets[path[2]].records;}
 if(path[0]==='sourceCandidates'){data.sourceCandidates={...data.sourceCandidates};return data.sourceCandidates;}
 data[path[0]]=[...(data[path[0]]||[])];return data[path[0]];
}
// Edits accompany the snapshot, so file imports and PostgreSQL imports use identical rules.
export function applyDataEdits(input,edits=input.insightEdits||{}){
 const data={...input,insightEdits:edits};
 // Keep the committed read identity when applying a local view. Losing these
 // non-enumerable markers forces a full reload on the next unchanged request.
 for(const key of ['_readVersion','_partHashes']){const descriptor=Object.getOwnPropertyDescriptor(input,key);if(descriptor)Object.defineProperty(data,key,descriptor);}
 const byKind=new Map();for(const edit of Object.values(edits)){if(!byKind.has(edit.kind))byKind.set(edit.kind,new Map());byKind.get(edit.kind).set(edit.key,edit);}
 for(const [kind,map]of [...byKind].sort(([a],[b])=>(a==='series'?0:1)-(b==='series'?0:1))){const found=new Set();for(const record of records(data,kind)){const edit=map.get(record.key);if(!edit)continue;found.add(record.key);const target=containers(data,record.path);if(!target)continue;const row={...record.row,...edit.patch};if(kind==='candidates'){if(edit.deleted)delete target[record.path[1]];else target[record.path[1]]=row;}else{const i=target.indexOf(record.row);if(i<0)continue;if(edit.deleted)target.splice(i,1);else target[i]=row;}}
  for(const edit of map.values())if(!found.has(edit.key)&&edit.restored&&!edit.deleted){const target=containers(data,edit.path);if(target){const row={...edit.original,...edit.patch};if(kind==='candidates')target[edit.path[1]]=row;else target.push(row);}}
 }
 return data;
}
function contextFor(data){
 const countryByDoc=new Map();for(const e of data.events||[])if(e.status!=='rejected')countryByDoc.set(e.documentId,[...new Set([...(countryByDoc.get(e.documentId)||[]),...(e.countries||[])])]);
 const docs=new Map((data.documents||[]).map(r=>[r.id,r])),referencedDocs=new Map(docs),series=[...(data.series||[])];
 for(const edit of Object.values(data.insightEdits||{}))if(edit.deleted){if(edit.kind==='documents')referencedDocs.set(edit.original.id,{...edit.original,...edit.patch});if(edit.kind==='series')series.push({...edit.original,...edit.patch});}
 const config=data.industryRuleConfig?snapshotRules(data):null,compiled=config?compileRules(config):null;
 const industries=new Map([...referencedDocs].map(([id,d])=>[id,!compiled||d.classificationManaged&&d.industry||d.industry?.manual||d.industry?.version===compiled.version?d.industry:classifyRecord(d,compiled)]));
 // Classify only small dataset metadata here, using the catalog's published rules.
 const datasets=config?classifySnapshot({documents:[],series,assetRegistries:data.assetRegistries||{}},config):{series,assetRegistries:data.assetRegistries||{}};
 const unifiedIds=new Set(unifiedIEA(data).sources.map(s=>s.id)),sourceAliases=new Map((data.sources||[]).filter(s=>!unifiedIds.has(s.id)).map(s=>[s.id,'iea']));
 return {docs,referencedDocs,industries,seriesIndustries:new Map(datasets.series.map(s=>[s.id,s.industry])),registryIndustries:new Map(Object.entries(datasets.assetRegistries).map(([id,r])=>[id,r.industry])),sourceAliases,proofs:new Map((data.evidence||[]).map(r=>[r.id,r])),countryByDoc,sources:new Map((data.sources||[]).map(r=>[r.id,r])),entities:new Map((data.entities||[]).map(r=>[r.id,r]))};
}
const countryValues=(...values)=>[...new Set(values.flat().filter(Boolean))].sort();
function recordScopes(record,ctx,classification,documentIds){
 const r=record.row,docs=documentIds.map(id=>ctx.referencedDocs.get(id)).filter(Boolean);
 if(docs.length&&['documents','observations','events','entities','relations','evidence'].includes(record.kind))return docs.map(d=>({topic:canonicalTopic(ctx.industries.get(d.id)?.primary||d.topic||''),sourceId:d.sourceId||'',date:d.publishedAt||'',country:countryValues(d.countries,record.kind==='events'?r.countries:ctx.countryByDoc.get(d.id))}));
 const context=record.context,dimension={topic:canonicalTopic(classification?.primary||r.topic||context.topic||''),sourceId:r.sourceId||context.sourceId||(record.kind==='sources'?r.id:''),country:countryValues(r.countryCode,r.country,r.countries,context.country)};
 if(record.kind==='series')return (r.rows||[]).map(row=>({...dimension,date:row.period||''}));
 // Lease/project snapshots do not acquire a publication date from their effective year.
 return [{...dimension,date:record.kind==='registries'&&record.path[1]!=='fr-boem'?'':r.period||r.publicationDate||r.publishedAt||r.eventDate||''}];
}
function summarize(record,ctx,edit){
 const r=record.row,documentIds=record.kind==='documents'?[r.id]:[...new Set([r.documentId,...(r.evidenceIds||[]).map(id=>ctx.proofs.get(id)?.documentId)].filter(Boolean))],documentId=documentIds[0],d=ctx.referencedDocs.get(documentId);
 const classification=record.kind==='documents'?ctx.industries.get(r.id):['series','statistics'].includes(record.kind)?ctx.seriesIndustries.get(record.kind==='series'?r.id:record.path[1]):record.kind==='registries'?ctx.registryIndustries.get(record.path[1]):r.industry||r.classification||ctx.industries.get(documentId);
 const sourceId=r.sourceId||record.context.sourceId||d?.sourceId||(record.kind==='sources'?r.id:''),topic=canonicalTopic(classification?.primary||r.topic||record.context.topic||d?.topic||'');
 const title=r.titleZh||r.title||r.objectZh||r.object||r.nameZh||r.name||r.project||r.label||r.subject||(r.from?`${ctx.entities.get(r.from)?.nameZh||ctx.entities.get(r.from)?.name||r.from} → ${ctx.entities.get(r.to)?.nameZh||ctx.entities.get(r.to)?.name||r.to}`:'')||record.context.dataset||r.quoteZh||r.quote||r.period||'未命名';
 const recordStatus=r.status||(record.kind==='registries'?r.type:'')||'';
 return {kind:record.kind,key:record.key,id:r.id||r.lease||r.period||'',title,subtitle:r.name&&r.subject?r.subject:r.metric||r.type||textSlice(r.summaryZh||'',0,120)||record.context.dataset||'',topic,sourceId,source:ctx.sources.get(sourceId)?.name||sourceId||'未标注',...dataOrigin(r.ingestion?r:{...r,ingestion:record.context.ingestion},d,ctx.sources.get(sourceId)),status:classification?.status||recordStatus||'unclassified',recordStatus,recordStatusLabel:r.statusZh||recordStatus,state:edit?.deleted?'deleted':edit?'edited':'original',date:String(r.period||r.publicationDate||r.publishedAt||r.eventDate||r.effectiveYear||''),country:countryValues(r.countryCode,r.country,r.countries,record.context.country,d?.countries,ctx.countryByDoc.get(documentId)),scopes:recordScopes(record,ctx,classification,documentIds),value:r.value??r.rawValue??r.capacityMW??null,unit:r.unit||record.context.unit||'',url:r.sourceUrl||r.url||record.context.sourceUrl||d?.url||'',documentId:r.documentId||'',updatedAt:edit?.updatedAt||null,revision:hash([record.kind,record.key,r,edit?.updatedAt]),deleted:!!edit?.deleted};
}
const readCache=new WeakMap();
function allSummaries(data){
 if(readCache.has(data))return readCache.get(data);
 const ctx=contextFor(data),edits=data.insightEdits||{},rows=[];
 for(const kind of dataKinds)for(const record of records(data,kind.id))rows.push(summarize(record,ctx,edits[kind.id+':'+record.key]));
 for(const edit of Object.values(edits))if(edit.deleted)rows.push(summarize({...descriptor(edit.kind,{...edit.original,...edit.patch},[],edit.path,edit.context),key:edit.key},ctx,edit));
 const bySource=new Map();for(const row of rows)if(row.kind!=='sources')for(const scope of row.scopes){if(!bySource.has(scope.sourceId))bySource.set(scope.sourceId,new Map());bySource.get(scope.sourceId).set(JSON.stringify(scope),scope);}
 for(const row of rows)if(row.kind==='sources'&&bySource.has(row.id))row.scopes=[...bySource.get(row.id).values()];
 const result={rows,ctx};readCache.set(data,result);return result;
}
export function periodBounds(value){
 const text=String(value||'');let match=text.match(/(\d{4})-Q([1-4])/);if(match){const y=Number(match[1]),m=(Number(match[2])-1)*3;return [new Date(Date.UTC(y,m,1)).toISOString().slice(0,10),new Date(Date.UTC(y,m+3,0)).toISOString().slice(0,10)];}
 match=text.match(/\b(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/);if(!match)return null;
 const y=Number(match[1]),m=Number(match[2]||1),d=Number(match[3]||1);if(m<1||m>12||d<1||d>31)return null;
 const start=new Date(Date.UTC(y,m-1,d));if(start.getUTCMonth()!==m-1)return null;
 const end=match[3]?start:match[2]?new Date(Date.UTC(y,m,0)):new Date(Date.UTC(y,12,0));return [start.toISOString().slice(0,10),end.toISOString().slice(0,10)];
}
export function queryData(data,filters={}){
 const {rows,ctx}=allSummaries(data),kind=filters.kind||'documents';if(kind!=='all'&&!dataKinds.some(k=>k.id===kind))throw new DataError('未知数据类型');
 const deleted=filters.deleted==='true',q=textSlice(String(filters.q||'').trim().toLowerCase(),0,300),from=filters.from||'',to=filters.to||'',country=countries.find(c=>c.name===filters.country)?.code||filters.country;
 if(from&&to&&from>to)throw new DataError('开始日期不能晚于结束日期');
 const hasShared=filters.topic||filters.sourceId||country||from||to;
 const shared=hasShared?rows.filter(r=>r.scopes.some(s=>(!filters.topic||s.topic===canonicalTopic(filters.topic))&&(!filters.sourceId||s.sourceId===filters.sourceId||ctx.sourceAliases.get(s.sourceId)===filters.sourceId)&&(!country||s.country.some(c=>String(c).toLowerCase().includes(String(country).toLowerCase())))&&(!from||periodBounds(s.date)?.[1]>=from)&&(!to||periodBounds(s.date)?.[0]<=to))):rows;
 const scope=shared.filter(r=>r.deleted===deleted&&(kind==='all'||r.kind===kind));
 const matched=scope.filter(r=>(!filters.status||(filters.status.startsWith('record:')?r.recordStatus===filters.status.slice(7):r.status===filters.status))&&(!filters.state||r.state===filters.state)&&(!filters.origin||r.origin===filters.origin)&&(!q||JSON.stringify(r).toLowerCase().includes(q)));
 const sort=['title','date','value','updatedAt'].includes(filters.sort)?filters.sort:'date',dir=filters.order==='asc'?1:-1;
 matched.sort((a,b)=>{if(sort==='value'){if(a.value===null)return b.value===null?a.key.localeCompare(b.key):1;if(b.value===null)return -1;return (Number(String(a.value).replaceAll(',',''))-Number(String(b.value).replaceAll(',','')))*dir||a.key.localeCompare(b.key);}return String(a[sort]||'').localeCompare(String(b[sort]||''),'zh-CN')*dir||a.key.localeCompare(b.key);});
 const pageSize=Math.max(10,Math.min(100,Math.floor(Number(filters.pageSize)||25))),pages=Math.max(1,Math.ceil(matched.length/pageSize)),page=Math.max(1,Math.min(pages,Math.floor(Number(filters.page)||1)));
 const business=scope.filter(r=>r.recordStatus&&r.recordStatus!==r.status);
 return {items:filters.format==='csv'?matched:matched.slice((page-1)*pageSize,page*pageSize),total:matched.length,page,pages,pageSize,revision:data.insightRevision||data.generatedAt,kinds:dataKinds.map(k=>({...k,count:shared.filter(r=>r.kind===k.id&&!r.deleted).length})),totalActive:shared.filter(r=>!r.deleted).length,deletedCount:shared.filter(r=>r.deleted).length,editedCount:shared.filter(r=>r.state==='edited').length,originCounts:Object.fromEntries(Object.keys(originNames).map(origin=>[origin,shared.filter(r=>!r.deleted&&r.origin===origin).length])),options:{topics:[...new Set(scope.map(r=>r.topic).filter(Boolean))].sort(),sources:[...new Map(scope.filter(r=>r.sourceId).map(r=>[r.sourceId,{id:r.sourceId,name:r.source}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')),origins:Object.entries(originNames).map(([id,name])=>({id,name})),statuses:[...new Set([...scope.map(r=>r.status),...business.map(r=>'record:'+r.recordStatus)])].sort(),statusLabels:Object.fromEntries(business.map(r=>['record:'+r.recordStatus,'记录状态 · '+r.recordStatusLabel]))}};
}
export function readDataRecord(data,kind,key){
 if(!dataKinds.some(k=>k.id===kind))throw new DataError('未知数据类型');
 const edit=data.insightEdits?.[kind+':'+key],record=findRecord(data,kind,key)||(edit?.deleted?{...descriptor(kind,{...edit.original,...edit.patch},[],edit.path,edit.context),key:edit.key}:null);if(!record)throw new DataError('记录不存在或已随来源版本更新',404);
 const ctx=allSummaries(data).ctx,summary=summarize(record,ctx,edit),doc=ctx.docs.get(record.row.documentId),evidenceIds=new Set(record.row.evidenceIds||[]);
 const proofs=(data.evidence||[]).filter(e=>evidenceIds.has(e.id)||(kind==='documents'&&e.documentId===record.row.id));
 return {...summary,record:record.row,context:{...record.context,document:doc?{id:doc.id,title:doc.titleZh||doc.title,url:doc.url}:null,originalDocumentDeleted:!!record.row.documentId&&!doc},editable:fields[kind],topics,history:(edit?.history||[]).slice(-30).reverse(),evidence:proofs.map(e=>({id:e.id,quote:e.quote,quoteZh:e.quoteZh})),original:edit?.original||null};
}
function validatePatch(kind,patch){
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length)throw new DataError('请至少修改一个字段');
 if(Buffer.byteLength(JSON.stringify(patch))>200000)throw new DataError('单次修改内容过大');
 const normalized={};for(const [name,value]of Object.entries(patch)){
  if(!fields[kind].includes(name))throw new DataError('该字段不可修改：'+name);
  if(['industry','classification'].includes(name)){
   if(!value||!['accepted','excluded','unmatched'].includes(value.status)||(value.status==='accepted'&&!topics.includes(value.primary)))throw new DataError('请选择有效的纳入状态与行业');
   normalized[name]={status:value.status,primary:topics.includes(value.primary)?value.primary:null,topics:value.status==='accepted'?[value.primary]:[],manual:true,reason:textSlice(String(value.reason||'数据明细人工修订'),0,1000),positive:[],negative:[]};continue;
  }
  if(['value','capacityMW','start'].includes(name)){if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)))throw new DataError(name+' 必须是有效数字');if(name==='value'&&value===null)throw new DataError('数值不能为空');}
  else if(name==='partial'){if(typeof value!=='boolean')throw new DataError('请选择有效的布尔值');}
  else if(name==='countries'){if(!Array.isArray(value)||value.length>60||value.some(c=>typeof c!=='string'||c.length>80))throw new DataError('国家应填写为文本数组');}
  else if(value!==null&&typeof value!=='string')throw new DataError(name+' 应填写文本');
  if(typeof value==='string'&&value.length>20000)throw new DataError(name+' 内容过长');
  if(['publishedAt','publicationDate','eventDate'].includes(name)&&value&&(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value.slice(0,10)))throw new DataError('日期无效，请使用 YYYY-MM-DD 或 ISO 时间');
  if(name==='topic'&&!topics.includes(value))throw new DataError('请选择有效行业');
  if(name==='sourceUrl'&&value&&!/^https?:\/\//i.test(value))throw new DataError('来源地址必须使用 http 或 https');
  normalized[name]=value;
 }
 if(kind==='official'&&Object.hasOwn(normalized,'value'))normalized.rawValue=String(normalized.value);
 if(kind==='official'&&Object.hasOwn(normalized,'status')&&!Object.hasOwn(normalized,'statusZh'))normalized.statusZh=normalized.status;
 if(kind==='documents'&&normalized.industry?.status==='accepted')normalized.topic=normalized.industry.primary;
 return normalized;
}
export function changeData(data,input,actor='authenticated-user'){
 const {kind,key,revision,action='edit'}=input;if(!['edit','delete','restore'].includes(action))throw new DataError('不支持的操作');
 const current=readDataRecord(data,kind,key);if(!revision||revision!==current.revision)throw new DataError('这条记录已发生变化，请重新打开后修改',409);
 if(action==='edit'&&current.deleted)throw new DataError('请先恢复这条记录',409);
 if(action==='delete'&&current.deleted||action==='restore'&&!current.deleted)throw new DataError('记录状态已变化，请刷新',409);
 const note=String(input.note||'').trim();if(!note||note.length>1000)throw new DataError('请填写 1–1000 字的修改原因');
 if(action==='delete'&&kind==='sources'){
  const id=current.record.id,referenced=dataKinds.some(k=>k.id!=='sources'&&[...records(data,k.id)].some(r=>(r.row.sourceId||r.context.sourceId)===id));if(referenced)throw new DataError('此渠道仍有关联数据，请先处理关联记录',409);
 }
 const previous=data.insightEdits?.[kind+':'+key],record=findRecord(data,kind,key),patch=action==='edit'?validatePatch(kind,input.patch):{};
 const at=new Date().toISOString(),log={id:randomUUID(),action,at,actor,note,fields:Object.keys(patch)},edit={kind,key,path:record?.path||previous.path,context:record?.context||previous.context,original:previous?.original||current.record,patch:{...previous?.patch,...patch},deleted:action==='delete',restored:action==='restore'||previous?.restored||false,updatedAt:at,history:[...(previous?.history||[]),log].slice(-100)};
 const edits={...data.insightEdits,[kind+':'+key]:edit},next=applyDataEdits({...data,insightRevision:randomUUID()},edits);
 return {data:next,edit,log:{...log,kind,key,before:current.record,after:action==='delete'?null:{...current.record,...patch}},result:{ok:true,action,revision:next.insightRevision}};
}

export const dataSchemaSql=[
 'CREATE TABLE IF NOT EXISTS ocean_intel.data_overrides (id text PRIMARY KEY,payload jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())',
 'CREATE TABLE IF NOT EXISTS ocean_intel.data_change_log (id text PRIMARY KEY,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now())'
];
export async function loadDataEdits(client){return Object.fromEntries((await client.query('SELECT id,payload FROM ocean_intel.data_overrides')).rows.map(r=>[r.id,r.payload]));}
export const lockData=client=>client.query("SELECT pg_advisory_xact_lock(hashtext('ocean_intel.insight-data'))");
export async function mutateStoreData(store,input,actor){
 let changed,committedForRefresh;
 if(store.pool){const client=await store.pool.connect();try{
  await client.query('BEGIN');await lockData(client);
  const locked=await client.query("SELECT id,payload->>'insightRevision' AS revision FROM ocean_intel.runs WHERE id='current' FOR UPDATE");if(!locked.rows.length)throw new DataError('当前快照不可用',503);
  const committed=applyDataEdits(await readWorkspaceClient(client,store.data),await loadDataEdits(client));committedForRefresh=committed;
  changed=changeData(committed,input,actor);const {edit,log}=changed;
  await client.query('INSERT INTO ocean_intel.data_overrides(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()',[edit.kind+':'+edit.key,edit]);
  await client.query('INSERT INTO ocean_intel.data_change_log(id,payload) VALUES($1,$2)',[log.id,log]);
  if(arrays.includes(edit.kind)){const row=edit.deleted?{...log.before,insightDeleted:true,insightDeletedAt:edit.updatedAt}:log.after;await client.query(`INSERT INTO ocean_intel.${edit.kind}(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()`,[row.id,row]);}
  changed.data._workspaceDelta=await writeWorkspace(client,changed.data,committed);await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');if(error.status===409&&committedForRefresh)store.data=committedForRefresh;throw error;}finally{client.release();}}
 else changed=changeData(store.data,input,actor);
 // A file write failure after a committed DB change must never masquerade as a rollback.
 if(store.pool){store.data=changed.data;await store.persist().catch(error=>{console.error('insight snapshot mirror:',error.code||error.name);});}
 else{const old=store.data;store.data=changed.data;try{await store.persist();}catch(error){store.data=old;throw error;}}
 return changed.result;
}

export async function serveInsightData(req,res,url,{store,serial,body,json}){
 if(await serveInsightImport(req,res,url,{store,serial,body,json,actor:'session_'+hash(req.headers.cookie||'local').slice(0,16)}))return true;
 if(url.pathname!=='/api/insight-data'&&url.pathname!=='/api/insight-data/record')return false;
 try{
  if(req.method==='GET'){
   const params=Object.fromEntries(url.searchParams),value=url.pathname.endsWith('/record')?readDataRecord(store.data,params.kind,params.key):queryData(store.data,params);
   if(params.format==='csv'&&Array.isArray(value.items)){
    const columns=[['kind','数据类型'],['id','编号'],['title','记录名称'],['subtitle','说明'],['topic','行业'],['status','分类或状态'],['recordStatusLabel','记录状态'],['value','数值'],['unit','单位'],['date','统计期或日期'],['country','国家'],['source','来源'],['originLabel','数据来源类型'],['state','修改状态'],['url','原始来源']];
    const cell=v=>'"'+String(v??'').replace(/^[=+@\t\r-]/,"'$&").replaceAll('"','""')+'"';
    const csv='\ufeff'+[columns.map(c=>c[1]),...value.items.map(r=>columns.map(([k])=>r[k]))].map(row=>row.map(cell).join(',')).join('\r\n');
    res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Cache-Control':'no-store','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent('产业数据明细.csv')});res.end(csv);return true;
   }
   json(res,200,value);return true;
  }
  if(req.method!=='POST'||!url.pathname.endsWith('/record')){json(res,405,{error:'不支持的方法'});return true;}
  if(req.headers['sec-fetch-site']==='cross-site'){json(res,403,{error:'跨站请求已拒绝'});return true;}
  const input=await body(req,250000),actor='session_'+hash(req.headers.cookie||'local').slice(0,16);
  const result=await serial(()=>mutateStoreData(store,input,actor));json(res,200,result);
 }catch(error){json(res,error.status||400,{error:error.status?error.message:error.message==='request too large'?'单次修改内容过大':'数据保存失败，请刷新后重试'});}
 return true;
}
