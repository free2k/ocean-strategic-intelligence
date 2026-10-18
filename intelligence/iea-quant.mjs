import {matchesCountry} from './country-filter.mjs';
import {countries} from './core.mjs';
const memo=new WeakMap();
const productSource=s=>s.id==='mp2rss_x:84679163'||s.id==='iea'||s.method==='authenticated-xlsx'||/^iea-(critical-minerals|ccus-projects|hydrogen-production)/.test(s.id);
export function unifiedIEA(raw){
 if(memo.has(raw))return memo.get(raw);
 const children=(raw.sources||[]).filter(productSource),ids=new Set(children.map(s=>s.id));
 if(!children.length)return raw;
 const parent={id:'iea',name:'IEA 国际能源署',url:'https://www.iea.org/',level:'S1',method:'dataset-and-news',status:children.some(s=>s.status==='ready')?'ready':'partial',checkedAt:children.map(s=>s.checkedAt||'').sort().at(-1),scope:'官方数据集与资讯统一来源；工作簿每7天检查版本，资讯沿用既有采集频率；仅符合六大领域规则的数据进入业务分析。'};
 const data={...raw,sources:[...raw.sources.filter(s=>!ids.has(s.id)),parent],documents:raw.documents.map(d=>ids.has(d.sourceId)?{...d,sourceId:'iea'}:d)};memo.set(raw,data);return data;
}
const grain=r=>[r.contentHash,r.sheet,String(r.cell).replace(/[A-Z]+/gi,'')].join('|');
const countryName=r=>countries.find(c=>c.code===r.countryCode)?.name||r.country||'未提供';
const labels={Dormant:'暂停推进',Concept:'概念阶段','Feasibility study':'可行性研究',DEMO:'示范阶段',FEED:'前端工程设计','Under construction':'建设中','Other Electrolysis':'其他电解技术',ALK:'碱性电解',PEM:'质子交换膜电解',Capture:'捕集','Full chain':'全链条','T&S':'运输与封存',Transport:'运输'};
export function selectIEA(raw,f={}){
 const records=[];
 for(const d of Object.values(raw.ieaDatasets?.datasets||{}))for(const r of d.records||[]){
  if(f.sourceId&&f.sourceId!=='iea'&&f.sourceId!==r.sourceId)continue;
  if(f.topic&&r.classification?.primary!==f.topic)continue;
  if(!matchesCountry(r.countryCode,f.country))continue;
  // A release/collection date is not a statistical period. Undated project snapshots are omitted under date filters.
  const period=r.period?String(r.period):'';
  if((f.from||f.to)&&(!period||(f.from&&period+(period.length===4?'-12-31':'')<f.from)||(f.to&&period+(period.length===4?'-01-01':'')>f.to)))continue;
  records.push({...r,sourceId:'iea',dataset:d.name,topic:r.classification?.primary,countryName:countryName(r),statusName:labels[r.status]||r.statusZh||r.status||'未提供',url:r.sourceUrl,archiveUrl:'api/iea-file?hash='+r.contentHash});
 }
 return records;
}
export function ieaSummary(raw,f={}){
 const rows=selectIEA(raw,f),accepted=rows.filter(r=>r.classification?.status==='accepted');
 return {records:rows.length,accepted:accepted.length,projects:new Set(accepted.filter(r=>!r.period).map(grain)).size,candidates:rows.filter(r=>r.classification?.status==='unmatched').length,excluded:rows.filter(r=>r.classification?.status==='excluded').length};
}
export function integrateIEACatalog(catalog,raw,f={}){
 const records=selectIEA(raw,f),accepted=records.filter(r=>r.classification?.status==='accepted'),cards=[];
 const buckets=new Map();for(const r of accepted){const k=[r.contentHash,r.sheet,r.topic].join('|');if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(r);}
 const source={id:'iea',name:'IEA 国际能源署',url:'https://www.iea.org/'};
 for(const group of buckets.values()){
  const first=group[0],entries=[...new Map(group.filter(r=>!r.period).map(r=>[grain(r),r])).values()];
  const stem='iea-'+first.contentHash.slice(0,10)+'-'+first.sheet.replace(/[^a-z0-9]/gi,'_')+'-'+first.topic;
  const base={industry:first.topic,sources:[source],templateId:'registry',update:'每7天检查原表版本；新版本替换当前快照，保留原始文件与版本历史。',content:'按同一版本、同一工作表的项目／阶段登记条目计数；同一行多个指标只计一次。不是独立物理项目总数，也不是产业规模。',rows:entries};
  if(entries.length>=2){
   const dims=['countryName','statusName'].filter(k=>new Set(entries.map(r=>r[k])).size>=2);
   if(dims.length)cards.push({...base,id:stem+'-distribution',title:first.dataset+'：项目／阶段分布',renderer:'official-distribution',types:dims.map(k=>k==='countryName'?'countryBar':'statusBar').concat(dims.length===2?['heatmap']:[]),why:'国家与开发状态分别比较；热力图交叉查看国家×状态。仅统计当前收录且通过行业规则的条目。',unit:'条登记记录'});
  }
  const metrics=new Map();for(const r of group){if(r.metric==='项目登记'||r.period||!Number.isFinite(r.value))continue;const k=[r.metric,r.unit,r.statusName,r.projectType,r.nature].join('|');if(!metrics.has(k))metrics.set(k,[]);metrics.get(k).push(r);}
  let n=0;for(const rows0 of metrics.values()){
   const rows=[...new Map(rows0.map(r=>[grain(r),r])).values()];if(rows.length<2)continue;
   const r=rows[0];cards.push({...base,id:stem+'-capacity-'+n++,title:r.metric+' · '+r.statusName+' · '+r.projectType,renderer:'official-capacity',templateId:'metric-comparison',types:['bar','dot'],unit:r.unit,rows,content:`${r.dataset}；${r.unit}；${r.nature}。同一状态、技术类型与原始指标分别比较；不跨阶段或项目加总，公布值与IEA估计值不混算。`,why:'横向比较最多15条数值最大的登记条目；完整数据在下方依据中保留。单条数据不生成对比图。'});
  }
 }
 const inventories=catalog.industries.map(i=>{const rows=accepted.filter(r=>r.topic===i.topic),projects=new Set(rows.filter(r=>!r.period).map(grain)).size;return {...i,registries:[...i.registries,...(projects?[{id:'iea-projects',name:'IEA 项目／阶段登记（非物理项目数）',count:projects,url:source.url}]:[])],sourceIds:[...new Set([...i.sourceIds,...(rows.length?['iea']:[])])]};});
 const status={accepted:'纳入',unmatched:'候选',excluded:'排除'};
 const officialRecords=records.map(r=>({行业:r.topic||'未纳入',数据集:r.dataset,对象:r.objectZh||r.object,国家:r.countryName,开发状态:r.statusName,指标:r.metric,数值:r.value,单位:r.unit,数据性质:r.nature,统计期:r.period||'登记快照（无统计期）',分类:status[r.classification?.status]||'候选',原因:r.classification?.reason,原表文件:r.filename,版本:r.release,工作表:r.sheet,单元格:r.cell,文件指纹:r.contentHash,topic:r.topic,url:r.url}));
 // Keep one panel per metric. Status/technology cohorts remain separate and selectable, never added together.
 const combined=[],capacity=new Map();for(const card of cards){if(card.renderer!=='official-capacity'){combined.push(card);continue;}const r=card.rows[0],k=[r.contentHash,r.sheet,r.topic,r.metric,r.unit,r.nature].join('|');if(!capacity.has(k))capacity.set(k,[]);capacity.get(k).push(card);}
 for(const members of capacity.values()){
  members.sort((a,b)=>(a.rows[0].statusName==='运行中'?-1:0)-(b.rows[0].statusName==='运行中'?-1:0)||b.rows.length-a.rows.length);
  const first=members[0],r=first.rows[0];combined.push({...first,title:r.dataset+'：'+r.metric,content:`${r.unit}；${r.nature}。下方选择同一状态与技术类型进行比较，公布值和估计值分开；登记能力不是实际产量，不跨阶段加总。`,rows:members.flatMap(c=>c.rows),cohorts:members.map(c=>({label:c.rows[0].statusName+' · '+(labels[c.rows[0].projectType]||c.rows[0].projectType)+'（'+c.rows.length+'条）',rows:c.rows})),selectedCohort:0});
 }
 for(const c of combined)c.templateId=c.renderer==='official-capacity'?'official-capacity':'official-distribution';
 const templates=[{id:'official-distribution',name:'官方项目／阶段分布',types:['bar','heatmap'],requires:'按同一原表行去重；至少两条登记、两个类别；热力图需要国家和状态均有多个类别。',update:'原始工作簿版本更新后重新计数；登记数量不代表产业规模。'},{id:'official-capacity',name:'官方项目同口径能力对比',types:['bar','dot'],requires:'同一工作表、指标、单位、状态与技术类型，至少两条数值；公布值与估计值分别比较。',update:'保留原表单元格，版本替换当前快照；不跨项目阶段汇总容量。'}].map(t=>({...t,matches:combined.filter(c=>c.templateId===t.id).length}));
 return {...catalog,planner:catalog.planner?{...catalog.planner,templates:[...catalog.planner.templates,...templates]}:undefined,industries:inventories,cards:[...catalog.cards,...combined],officialRecords,ieaSummary:ieaSummary(raw,f),datasetVersions:Object.values(raw.ieaDatasets?.datasets||{}).filter(d=>records.some(r=>r.contentHash===d.contentHash)).map(d=>({name:d.name,filename:d.filename,hash:d.contentHash,release:d.release,checkedAt:d.checkedAt,url:d.sourceUrl})),sources:unifiedIEA(raw).sources};
}
