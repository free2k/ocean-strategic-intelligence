import {standardTopics,canonicalTopic} from './industry-topics.mjs';
import {reviewState} from './public/classification-review.js';
import {reportRange} from './research/period-reports.mjs';
import {setImmediate as yieldToReads} from 'node:timers/promises';

const state=d=>d.classification?.status==='accepted'?'accepted':d.classification?.status==='excluded'?'excluded':'pending';
const hits=(c,negative=false)=>[...new Set((negative?c?.negative||[]:(c?.positive||[]).flatMap(p=>p.keywords||[])).map(k=>typeof k==='string'?k:k.keyword).filter(Boolean))];
export function evidenceChannels(documents){
 const groups=new Map();
 for(const d of documents){const name=String(d.sourceName||'').trim().replace(/\s+/g,' '),known=name&&name!=='未记录渠道',key=known?'name:'+name:'id:'+String(d.sourceId||'unknown');const group=groups.get(key)||{key,name:known?name:'未记录渠道 · '+String(d.sourceId||'未知入口'),ids:new Set()};if(d.sourceId)group.ids.add(d.sourceId);groups.set(key,group);}
 return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')).map(g=>({...g,ids:[...g.ids]}));
}
const entry=d=>({d,state:state(d),review:reviewState(d).status,topics:[d.classification?.primary,...(d.classification?.positive||[]).map(p=>p.topic)].filter(Boolean).map(canonicalTopic),primary:canonicalTopic(d.classification?.primary),search:[d.title,d.titleZh,d.sourceName,d.classification?.reason,...hits(d.classification),...hits(d.classification,true)].join(' ').toLowerCase(),time:Date.parse(d.publishedAt)||0});
function finishIndex(inventory,entries){
 const channels=evidenceChannels(inventory.documents);entries.sort((a,b)=>b.time-a.time||a.d.id.localeCompare(b.d.id));
 const sourceIndex=inventory.documents.map(d=>Object.fromEntries(['id','workingId','title','sourceName','publishedAt','url'].filter(k=>Object.hasOwn(d,k)).map(k=>[k,d[k]])));
 return {inventory,entries,channels,sourceIndex};
}
export function createEvidenceIndex(inventory){return finishIndex(inventory,inventory.documents.map(entry));}
export async function createEvidenceIndexAsync(inventory){
 const entries=[];for(let i=0;i<inventory.documents.length;i+=200){for(const d of inventory.documents.slice(i,i+200))entries.push(entry(d));await yieldToReads();}
 return finishIndex(inventory,entries);
}
export function queryEvidence(index,filters={}){
 const {inventory,channels}=index,ids=channels.find(s=>s.key===filters.source)?.ids,search=String(filters.search||'').toLowerCase();
 const rows=index.entries.filter(e=>{const d=e.d;return (!filters.review||(filters.review==='completed'?e.review==='completed':e.review!=='completed'))&&(!filters.group||d.channelGroup===filters.group)&&(!filters.source||(d.sourceIds||[d.sourceId]).some(id=>ids?.includes(id)))&&(!filters.topic||(filters.topic==='none'?!e.topics.length:e.topics.includes(filters.topic)))&&e.search.includes(search);});
 const counts={total:rows.length,accepted:0,excluded:0,pending:0},bridge={eligible:0,delivered:0,missing:0};
 for(const e of rows){counts[e.state]++;if(e.d.channelGroup==='mp2rss'&&e.state==='accepted'){if(e.d.bodyComplete){bridge.eligible++;if(e.d.synced)bridge.delivered++;}else bridge.missing++;}}
 const visible=filters.status?rows.filter(e=>e.state===filters.status):rows,pages=Math.max(1,Math.ceil(visible.length/12)),page=Math.max(1,Math.min(pages,Math.floor(Number(filters.page)||1)));
 return {paged:true,mode:inventory.mode,observedAt:inventory.observedAt,metricVersion:inventory.metricVersion,ruleConfig:inventory.ruleConfig,channels,counts,bridge,total:visible.length,page,pages,pageSize:12,documents:visible.slice((page-1)*12,page*12).map(e=>e.d)};
}
export function evidencePeriodPreview(index,input,capabilities={},now=new Date()){
 const range=reportRange(input,now),rows=index.entries.filter(e=>e.time>=range.start&&e.time<range.end),excluded=rows.filter(e=>e.state==='excluded').length,pending=rows.filter(e=>e.state==='pending').length;
 return {range,observedAt:index.inventory.observedAt,total:rows.length,excluded,pending,undated:index.entries.filter(e=>!Number.isFinite(Date.parse(e.d.publishedAt))).length,modelReady:!!capabilities.modelReady,generationReady:!!capabilities.modelReady||!!capabilities.localOnly,generationMethod:capabilities.localOnly?'local-extractive':'model',maxPerDomain:null,excerptCharacters:6000,domains:standardTopics.map(t=>{const eligible=rows.filter(e=>e.state==='accepted'&&e.primary===t.id).length;return {topic:t.id,name:t.name,eligible,maximumInput:eligible};})};
}
export function evidenceReportList(reports){return Object.values(reports).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30).map(({documents,domains,...j})=>({...j,domains:domains.map(({content,semanticReview,...d})=>d)}));}
export function compactEvidenceReport(job){
 const samples=new Set(job.domains.map(d=>job.documents?.find(e=>e.classification?.primary===d.topic)?.documentId).filter(Boolean));
 return {...job,readView:'summary',documents:(job.documents||[]).map(e=>samples.has(e.documentId)?e:{...e,classification:e.classification?{status:e.classification.status,primary:e.classification.primary}:e.classification,body:{...Object.fromEntries(['documentId','title','titleZh','url','publishedAt'].filter(k=>Object.hasOwn(e.body||{},k)).map(k=>[k,e.body[k]])),deferred:true}})};
}
