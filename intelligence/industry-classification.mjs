import {createHash} from 'node:crypto';
export const industries=['海洋油气','海上风电','海洋低碳','多能融合','宏观政策','海洋装备'];
export const industryNames={'海上风电':'海洋新能源（含海上风电）'};
const mapping={'海洋油气':'海洋油气','海洋油气装备':'海洋装备','海洋新能源':'海上风电','海洋多能融合':'多能融合','海洋低碳领域':'海洋低碳','海洋能源资源宏观政策':'宏观政策'};
const marine=/海洋|海上|海底|深海|深水|近海|海工|海域|蓝碳|offshore|subsea|deepwater|deep.water|ocean|marine|blue carbon|Northern Lights|FPSO|FSRU|seabed/i;
const aliases=[{topic:'海洋低碳',groups:[['Northern Lights','offshore','subsea','seabed','海底','海洋'],['carbon storage','CO₂','CO2','CCS','carbon capture','封存']]},{topic:'多能融合',groups:[['海上能源岛','海上综合能源','offshore energy island','wind-fishery integration']]},{topic:'海洋油气',groups:[['offshore','deepwater','海上','海底','深水'],['oil','gas','原油','天然气','油气']]},{topic:'海上风电',groups:[['ocean thermal energy','wave energy','tidal energy','offshore wind','波浪能','潮汐能','温差能']] }];
const visible=s=>String(s||'').replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
export function hasTerm(text,term){if(!term?.trim())return false;const t=term.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return /[a-z]/i.test(term)?new RegExp('(?<![a-z0-9])'+t+'(?![a-z0-9])','i').test(text):text.includes(term);}
export function compileRules(config){const rules=config.rules.filter(r=>r.enabled!==false).slice().sort((a,b)=>(a.priority??99)-(b.priority??99));return{rules,version:createHash('sha256').update(JSON.stringify({rules,aliases,policy:'marine-lead-context-focus-v2'})).digest('hex').slice(0,12),origin:config.exportedAt||'repository'};}
export function classifyRecord(record,compiled){
 const title=visible([record.title,record.titleZh].filter(Boolean).join('\n')),content=visible([record.content,record.contentZh].filter(Boolean).join('\n')),text=title+' '+content,positive=[],negative=[];
 for(const rule of compiled.rules){const titleHits=(rule.title_keywords||[]).filter(k=>hasTerm(title,k)),contentHits=(rule.content_keywords||[]).filter(k=>hasTerm(content,k));const hits=[...titleHits.map(keyword=>({keyword,field:'标题'})),...contentHits.map(keyword=>({keyword,field:'正文'}))];
 if(rule.type==='exclude'){negative.push(...hits);continue;}const topic=mapping[rule.topic];if(!topic)continue;const groups=rule.groups||[],groupHits=groups.map(g=>g.filter(k=>hasTerm(text,k)));const grouped=groups.length>0&&groupHits.every(g=>g.length>0);
 if((rule.require_all?grouped:hits.length>0||grouped))positive.push({topic,origin:'原项目规则',keywords:hits.length?hits:groupHits.flat().map(keyword=>({keyword,field:'组合条件'})),priority:rule.priority??99});
 }
 for(const a of aliases)if(a.groups.every(g=>g.some(k=>hasTerm(text,k)))&&!positive.some(p=>p.topic===a.topic))positive.push({topic:a.topic,origin:'本地补充别名',keywords:a.groups.flatMap(g=>g.filter(k=>hasTerm(text,k))).map(keyword=>({keyword,field:'中英别名'})),priority:100});
 const inScope=marine.test(title+' '+content.slice(0,1800)),status=negative.length?'excluded':!inScope?'unmatched':positive.length?'accepted':'unmatched';
 const focus=title+' '+content.slice(0,500),preferred=[
 ['多能融合',/能源岛|微电网|风渔|多能|近零碳海岛|energy island|microgrid|multi.energy/i],
 ['海洋低碳',/Northern Lights|北方之光|二氧化碳|碳封存|碳捕|CO[₂2]|carbon (?:storage|capture)|CCS|蓝碳/i],
 ['宏观政策',/指导|政策|管理办法|许可申请|行动计划|guidance|regulation/i],
 ['海上风电',/海上风电|海缆|海洋热能|温差能|潮流能|wave energy|tidal energy|ocean thermal|offshore wind/i],
 ['海洋装备',/钻井平台|船舶|运输船|造船|钻机|船长|FSRU|vessel|shipbuilding|fleet|drilling rig/i],
 ['海洋油气',/油田|油气|原油|储量|产量|oil|petroleum|gas field|reservoir|production/i]
 ].find(([topic,re])=>re.test(focus)&&positive.some(p=>p.topic===topic))?.[0]||positive[0]?.topic;
 return{status,primary:status==='accepted'?preferred:null,legacyPrimary:positive.find(p=>p.origin==='原项目规则')?.topic||null,primaryBasis:'命中正向规则后，按标题及前500字的具体行业语境确定主领域；多标签保留',topics:status==='accepted'?[...new Set(positive.map(p=>p.topic))]:[],positive,negative,reason:negative.length?'命中反向规则':!inScope?'缺少海洋能源语境':positive.length?'正向规则匹配':'未命中行业正向词',version:compiled.version};
}
const seriesContext={'eia-offshore-crude':{topic:'海洋油气',text:'offshore oil and gas 美国联邦海域海湾原油月度产量'},'transocean-utilization':{topic:'海洋装备',text:'offshore drilling platform equipment 全船队平均平台利用率'},'transocean-revenue-efficiency':{topic:'海洋装备',text:'offshore drilling platform equipment 全船队收入效率'},'transocean-daily-revenue':{topic:'海洋装备',text:'offshore drilling platform equipment 全船队平均日收入'}};
export function classifySnapshot(snapshot,config){
 const compiled=compileRules(config),data=structuredClone(snapshot);
 data.documents=data.documents.map(d=>({...d,industry:classifyRecord(d,compiled)}));
 data.series=(data.series||[]).map(s=>{const meta=seriesContext[s.id],industry=classifyRecord({title:s.name,content:[s.note,meta?.text,s.classificationContext].join(' ')},compiled);if(industry.status==='accepted'&&meta&&industry.topics.includes(meta.topic))industry.primary=meta.topic;return{...s,industry};});
 data.assetRegistries=Object.fromEntries(Object.entries(data.assetRegistries||{}).map(([key,r])=>[key,{...r,industry:classifyRecord({title:key==='boem'?'offshore wind 海上风电租约登记表':r.name||key,content:[r.classificationContext,r.rows.map(x=>x.resource).join(' ')].join(' ')},compiled)}]));
 data.industryRuleVersion=compiled.version;return data;
}
export function acceptedSnapshot(data,topic=''){
 const selected=x=>x.industry?.status==='accepted'&&(!topic||x.industry.primary===topic),documents=data.documents.filter(selected),ids=new Set(documents.map(d=>d.id));
 const next={...data,documents,series:data.series.filter(selected),assetRegistries:Object.fromEntries(Object.entries(data.assetRegistries).filter(([,r])=>selected(r)))};
 for(const key of ['events','relations','observations','evidence'])next[key]=(data[key]||[]).filter(r=>ids.has(r.documentId)&&r.status!=='rejected');return next;
}
