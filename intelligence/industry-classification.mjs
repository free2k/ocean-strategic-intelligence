import {createHash} from 'node:crypto';
import {standardTopics,canonicalTopic,topicDefinition,marineContextPattern,supplementalRules,taxonomyVersion} from './industry-topics.mjs';
export const industries=standardTopics.map(t=>t.id);
import {isLowCarbon} from './system-profile.mjs';
import {classifyLowCarbon} from './low-carbon/taxonomy.mjs';
export const industryNames=Object.fromEntries(standardTopics.map(t=>[t.id,t.name]));
const marine=new RegExp(marineContextPattern,'i');
const aliases=supplementalRules;
const visible=s=>String(s||'').replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const lowCarbonPatterns=new Map();
export function hasTerm(text,term){
 if(!term?.trim())return false;
 if(!/[a-z]/i.test(term))return text.includes(term);
 const key=term.trim().toLowerCase();let pattern=isLowCarbon?lowCarbonPatterns.get(key):null;
 if(!pattern){const t=term.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');pattern=new RegExp('(?<![a-z0-9])'+t+'(?![a-z0-9])','i');if(isLowCarbon){if(lowCarbonPatterns.size>=4096)lowCarbonPatterns.delete(lowCarbonPatterns.keys().next().value);lowCarbonPatterns.set(key,pattern);}}
 return pattern.test(text);
}
export function compileRules(config){const rules=config.rules.filter(r=>r.type==='context'||r.enabled!==false).map(r=>({...(r.type==='context'?{enabled:r.enabled!==false}:{}),id:r.id,type:r.type,topic:canonicalTopic(r.topic),description:isLowCarbon?r.description:topicDefinition(r.topic)?.definition||r.description,title_keywords:r.title_keywords||r.titleKeywords||[],content_keywords:r.content_keywords||r.contentKeywords||[],priority:r.priority??99,require_all:r.require_all??r.requireAll??false,groups:r.groups||[]})).sort((a,b)=>a.priority-b.priority||(a.id||0)-(b.id||0));return{rules,version:createHash('sha256').update(JSON.stringify({rules,aliases,standardTopics,taxonomyVersion,policy:isLowCarbon?'low-carbon-context-lexicons-v5':'marine-lead-context-focus-v2'})).digest('hex').slice(0,12),origin:config.exportedAt||'repository'};}
export function classifyRecord(record,compiled){
 if(isLowCarbon)return classifyLowCarbon(record,compiled,hasTerm);
 const title=visible([record.title,record.titleZh].filter(Boolean).join('\n')),content=visible([record.content,record.contentZh].filter(Boolean).join('\n')),text=title+' '+content,positive=[],negative=[];
 for(const rule of compiled.rules){if(rule.type==='context')continue;const titleHits=(rule.title_keywords||[]).filter(k=>hasTerm(title,k)),contentHits=(rule.content_keywords||[]).filter(k=>hasTerm(content,k));const hits=[...titleHits.map(keyword=>({keyword,field:'标题'})),...contentHits.map(keyword=>({keyword,field:'正文'}))];
 if(rule.type==='exclude'){negative.push(...hits);continue;}const topic=topicDefinition(rule.topic)?.id;if(!topic)continue;const groups=rule.groups||[],groupHits=groups.map(g=>g.filter(k=>hasTerm(text,k)));const grouped=groups.length>0&&groupHits.every(g=>g.length>0);
 if((rule.require_all?grouped:hits.length>0||grouped))positive.push({topic,origin:'原项目规则',keywords:hits.length?hits:groupHits.flat().map(keyword=>({keyword,field:'组合条件'})),priority:rule.priority??99});
 }
 for(const a of aliases)if(a.groups.every(g=>g.some(k=>hasTerm(text,k)))&&!positive.some(p=>p.topic===a.topic))positive.push({topic:a.topic,origin:'本地补充别名',keywords:a.groups.flatMap(g=>g.filter(k=>hasTerm(text,k))).map(keyword=>({keyword,field:'中英别名'})),priority:100});
 const contextRules=compiled.rules.filter(r=>r.type==='context');
 const contextHits=contextRules.filter(r=>r.enabled!==false).flatMap(r=>[...(r.title_keywords||[]).filter(k=>hasTerm(title,k)).map(keyword=>({keyword,field:'标题'})),...(r.content_keywords||[]).filter(k=>hasTerm(content.slice(0,1800),k)).map(keyword=>({keyword,field:'正文前1800字符'}))]);
 const inScope=contextRules.length?contextHits.length>0:marine.test(title+' '+content.slice(0,1800)),status=negative.length?'excluded':!inScope?'unmatched':positive.length?'accepted':'unmatched';
 const focus=title+' '+content.slice(0,500),preferred=[
 ['多能融合',/能源岛|微电网|风渔|多能|近零碳海岛|energy island|microgrid|multi.energy/i],
 ['海洋低碳',/Northern Lights|北方之光|二氧化碳|碳封存|碳捕|CO[₂2]|carbon (?:storage|capture)|CCS|蓝碳/i],
 ['宏观政策',/指导|政策|管理办法|许可申请|行动计划|guidance|regulation/i],
 ['海上风电',/海上风电|海缆|海洋热能|温差能|潮流能|wave energy|tidal energy|ocean thermal|offshore wind/i],
 ['海洋装备',/钻井平台|船舶|运输船|造船|钻机|船长|FSRU|vessel|shipbuilding|fleet|drilling rig/i],
 ['海洋油气',/油田|油气|原油|储量|产量|oil|petroleum|gas field|reservoir|production/i]
 ].find(([topic,re])=>re.test(focus)&&positive.some(p=>p.topic===topic))?.[0]||positive[0]?.topic;
 return{status,primary:status==='accepted'?preferred:null,legacyPrimary:positive.find(p=>p.origin==='原项目规则')?.topic||null,primaryBasis:'命中正向规则后，按标题及前500字的具体行业语境确定主领域；多标签保留',topics:status==='accepted'?[...new Set(positive.map(p=>p.topic))]:[],positive,negative,context:{basis:contextRules.length?'数据库通用海洋语境词':'历史默认语境词',matched:inScope,hits:contextHits},reason:negative.length?'命中反向规则':!inScope?'缺少海洋能源语境':positive.length?'正向规则匹配':'未命中行业正向词',version:compiled.version};
}
const seriesContext={'eia-offshore-crude':{topic:'海洋油气',text:'offshore oil and gas 美国联邦海域海湾原油月度产量'},'transocean-utilization':{topic:'海洋装备',text:'offshore drilling platform equipment 全船队平均平台利用率'},'transocean-revenue-efficiency':{topic:'海洋装备',text:'offshore drilling platform equipment 全船队收入效率'},'transocean-daily-revenue':{topic:'海洋装备',text:'offshore drilling platform equipment 全船队平均日收入'}};
export function classifySnapshot(snapshot,config){
 const compiled=compileRules(config),data=structuredClone(snapshot);
 data.documents=data.documents.map(d=>({...d,industry:(d.classificationManaged&&d.industry)||d.industry?.manual||d.industry?.version===compiled.version?d.industry:classifyRecord(d,compiled)}));
 data.series=(data.series||[]).map(s=>{const meta=seriesContext[s.id],industry=classifyRecord({title:s.name,content:[s.note,meta?.text,s.classificationContext].join(' ')},compiled);if(industry.status==='accepted'&&meta&&industry.topics.includes(meta.topic))industry.primary=meta.topic;return{...s,industry};});
 data.assetRegistries=Object.fromEntries(Object.entries(data.assetRegistries||{}).map(([key,r])=>[key,{...r,industry:classifyRecord({title:key==='boem'?'offshore wind 海上风电租约登记表':r.name||key,content:[r.classificationContext,r.rows.map(x=>x.resource).join(' ')].join(' ')},compiled)}]));
 data.industryRuleVersion=compiled.version;return data;
}
export function acceptedSnapshot(data,topic=''){
 const selected=x=>x.industry?.status==='accepted'&&(!topic||x.industry.primary===topic),documents=data.documents.filter(selected),ids=new Set(documents.map(d=>d.id));
 const next={...data,documents,series:data.series.filter(selected),assetRegistries:Object.fromEntries(Object.entries(data.assetRegistries).filter(([,r])=>selected(r)))};
 for(const key of ['events','relations','observations','evidence'])next[key]=(data[key]||[]).filter(r=>ids.has(r.documentId)&&r.status!=='rejected');return next;
}
