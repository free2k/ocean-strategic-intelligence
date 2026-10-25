import {countries} from '../core.mjs';
import {selectSeries} from '../series-evidence.mjs';
const countryNames=new Map(countries.map(c=>[c.code,c.name]));
export function selectedOfficialGroups(raw,f={}){
 if(!raw.officialData)return [];
 // An undated registry snapshot is not a publication or an operating event.
 if(f.from||f.to)return [];
 return raw.officialData.projectGroups.map(g=>({...g,rows:g.rows.filter(r=>(!f.topic||r.topic===f.topic)&&(!f.sourceId||r.sourceId===f.sourceId)&&(!f.country||r.countryCodes.includes(f.country)))})).filter(g=>g.rows.length);
}
export function officialRegistrySummary(raw,f={}){
 const groups=selectedOfficialGroups(raw,f),rows=groups.flatMap(g=>g.rows);
 return {records:rows.length,accepted:rows.length,projects:rows.length,candidates:0,excluded:0,datasets:groups.length,grain:'官方项目/阶段登记行；非独立物理项目总数',releases:groups.map(g=>({name:g.name,release:g.release}))};
}
export function integrateOfficialCatalog(catalog,raw,f={}){
 if(!raw.officialData)return catalog;
 const groups=selectedOfficialGroups(raw,f),cards=[],sources=raw.sources;
 const sourceFor=id=>sources.filter(s=>s.id===id);
 const recordRows=[];
 for(const g of groups){
  for(const topic of new Set(g.rows.map(r=>r.topic))){
   const rows=g.rows.filter(r=>r.topic===topic).map(r=>({...r,countryName:r.countryCodes.length===1?countryNames.get(r.countryCode)||r.country:r.country}));
   const base={industry:topic,sources:sourceFor(g.sourceId),content:`${g.release}。按原表项目/阶段行计数，非独立物理项目总数；历史快照不是今日项目状态。各状态、技术和指标分别展示，不跨阶段相加能力。`,update:'新原始文件按指纹与源记录更新；保留版次和历史来源。',unit:'条登记记录'};
   if(rows.length>1)cards.push({...base,id:'official-'+g.id+'-'+topic+'-distribution',title:g.name+'：国别与开发状态',renderer:'official-distribution',templateId:'official-distribution',types:['countryBar','statusBar',...(new Set(rows.map(r=>r.countryName)).size>1&&new Set(rows.map(r=>r.statusName)).size>1?['heatmap']:[])],why:'项目/阶段的登记覆盖；一行只计一次，不能据此判断实际投运规模。',rows});
   const metrics=new Map();
   for(const row of rows)for(const metric of row.metrics){const key=metric.metric+'|'+metric.unit;if(!metrics.has(key))metrics.set(key,[]);metrics.get(key).push({...row,...metric});}
   for(const [key,metricRows] of metrics){
    const cohorts=new Map();for(const r of metricRows){const cohort=r.statusName+' · '+r.projectType;if(!cohorts.has(cohort))cohorts.set(cohort,[]);cohorts.get(cohort).push(r);}
    const selected=[...cohorts].filter(([,r])=>r.length>1).sort(([a],[b])=>Number(b.startsWith('运行中'))-Number(a.startsWith('运行中'))||a.localeCompare(b)).map(([label,rows])=>({label:label+'（'+rows.length+'条）',rows}));
    if(!selected.length)continue;
    cards.push({...base,id:'official-'+g.id+'-'+topic+'-'+metricRows[0].metric, title:g.name+'：'+metricRows[0].metric,renderer:'official-capacity',templateId:'official-capacity',types:['bar','dot'],unit:metricRows[0].unit,rows:metricRows,cohorts:selected,selectedCohort:0,why:'只比较同一原表指标、单位、状态和技术类型。源端估计与公布能力不混算；不是实际产量或净减排量。'});
   }
   for(const r of rows)recordRows.push({行业:r.topic,数据集:g.name,对象:r.object,国家:r.countryName,开发状态:r.statusName,版本:r.release,数据性质:r.nature,原表文件:r.filename,工作表:r.sheet,单元格:r.cell,文件指纹:r.contentHash,topic:r.topic,url:r.url});
  }
 }
 const officialSeries=selectSeries(raw,f).filter(s=>s.officialImported),seriesIds=new Set(officialSeries.map(s=>s.id)),families=new Map();
 for(const s of officialSeries){const family=s.seriesFamily||s.sourceId+'|'+s.keywords?.[0];if(!families.has(family))families.set(family,[]);families.get(family).push(s);}
 for(const [family,series] of families){
  series.sort((a,b)=>Number(b.country==='GLOBAL')-Number(a.country==='GLOBAL')||Number(b.country==='CN')-Number(a.country==='CN')||a.country.localeCompare(b.country));
  const first=series[0],cohorts=series.map(s=>({label:(countryNames.get(s.country)||s.countryName||s.country)+'（'+s.rows[0].period+'—'+s.rows.at(-1).period+'）',rows:s.rows.map(r=>({...r,unit:s.unit,url:r.sourceUrl||s.sourceUrl,subject:countryNames.get(s.country)||s.countryName,nature:s.nature}))}));
  cards.push({id:'official-series-'+family,industry:first.topic,title:first.seriesTitle||first.name.split('：').slice(1).join('：')+'：国别年度序列',renderer:'series',templateId:'timeline',types:['line','bar'],unit:first.unit,rows:cohorts.flatMap(c=>c.rows),cohorts,selectedCohort:0,sources:sourceFor(first.sourceId),content:first.note+' '+first.release,why:'按国家/地区选择同口径年度序列；缺失年份留空，不跨国家或技术相加。',update:'以来源、指标、国别及统计年更新，保留原始单元格与来源标记。'});
 }
 const inventories=catalog.industries.map(i=>{const registries=groups.flatMap(g=>{const rows=g.rows.filter(r=>r.topic===i.topic);return rows.length?[{id:'official-'+g.id,name:g.name,count:rows.length,url:g.sourceUrl}]:[];});return {...i,registries:[...i.registries,...registries],sourceIds:[...new Set([...i.sourceIds,...groups.filter(g=>g.rows.some(r=>r.topic===i.topic)).map(g=>g.sourceId)])]};});
 const retained=catalog.cards.filter(c=>!seriesIds.has(c.seriesId));
 return {...catalog,industries:inventories,cards:[...cards,...retained],officialRecords:[...(catalog.officialRecords||[]),...recordRows],officialSummary:officialRegistrySummary(raw,f),datasetVersions:[...(catalog.datasetVersions||[]),...groups.map(g=>({name:g.name,filename:g.filename,hash:g.contentHash,release:g.release,url:g.sourceUrl}))]};
}
