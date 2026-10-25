import {createHash} from 'node:crypto';
import {templates,templateVersion,templateById} from './templates.mjs';
import {comparableGroups} from './metric-normalize.mjs';
const key=s=>createHash('sha256').update(s).digest('hex').slice(0,12);
export function validPeriod(p){return /^\d{4}$/.test(p)||/^\d{4}-(0[1-9]|1[0-2])$/.test(p)||/^\d{4}-Q[1-4]$/.test(p)||/^\d{4}-\d{2}-\d{2}$/.test(p)&&Number.isFinite(Date.parse(p))&&new Date(p).toISOString().slice(0,10)===p;}
export function publicationDay(value){
 if(typeof value!=='string')return null;
 if(/^\d{4}-\d{2}-\d{2}$/.test(value))return Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?value:null;
 if(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))return null;
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
}
export function normalizeSeries(series){
 const rows=new Map(),rejected=[];
 for(const row of series.rows||[]){if(!validPeriod(row.period)||typeof row.value!=='number'||!Number.isFinite(row.value)){rejected.push({period:row.period,reason:'统计期或数值无效'});continue;}rows.set(row.period,{...row,unit:series.unit,url:row.sourceUrl||series.sourceUrl});}
 return {rows:[...rows.values()].sort((a,b)=>a.period.localeCompare(b.period)),rejected};
}
export function planTemplates(catalog){
 const generated=[],decisions=[],sourcesFor=ids=>catalog.sources.filter(s=>ids.includes(s.id));
 const metrics=comparableGroups(catalog.observations);
 for(const group of metrics.groups){const row=group.rows[0];generated.push({id:'metric-'+key(group.key),industry:row.topic,title:row.metricName+(group.rows.length===1?'：导入数值':'：原文对象对比'),types:['dot',...(group.rows.length>=5?['boxplot']:[])],renderer:'metric-comparison',templateId:'metric-comparison',unit:row.unit,rows:group.rows,sources:sourcesFor([row.sourceId]),content:`同一篇披露，${row.nature}，${row.unit}；统计期：${row.period||'原文未提供，仅比较本篇披露对象'}。不跨文章推断可比性；不同对象工况可能不同，不据此归因技术效果。`,why:`${group.rows.length} 个不同对象去除指标名中逐字相同的对象前缀后，指标名称、单位、性质与统计期一致，数值有逐字证据。点图便于比较，不将对象数值相加。`,update:templateById.get('metric-comparison').update});}
 for(const s of catalog.series){
  const {rows,rejected}=normalizeSeries(s);decisions.push({dataset:s.name,accepted:rows.length,rejected:rejected.length,reason:!s.unit?'缺少单位':rows.length<2?'不足两个有效统计期':'单序列同单位，统计期合法',details:rejected});
  if(!s.unit||rows.length<2)continue;
  if(new Set(rows.map(r=>r.period.includes('Q')?'quarter':r.period.length===4?'year':r.period.length===10?'day':'month')).size>1){decisions.at(-1).reason='混合不同统计频率，拒绝合并绘图';continue;}
  const month=rows.every(r=>/^\d{4}-\d{2}$/.test(r.period));
  const years=new Map();rows.forEach(r=>years.set(r.period.slice(0,4),(years.get(r.period.slice(0,4))||0)+1));
  const constant=new Set(rows.map(r=>r.value)).size===1,zero=constant&&rows[0].value===0;
  const types=constant?['line']:[...(month?['heatmap']:[]),'line',...(month&&[...years.values()].some(n=>n>=5)?['boxplot']:[])];
  generated.push({id:s.id==='eia-offshore-crude'?'oil-month':'series-'+key(s.id),seriesId:s.id,industry:s.topic,title:s.name,types,constant,zero,renderer:'series',templateId:'timeline',unit:s.unit,rows,sources:sourcesFor([s.sourceId]),content:`${zero?'当前筛选范围内源字段均为0。零值已保留，但不能据此推断停产、无资源或没有活动；应结合字段口径核验。':constant?'当前范围数值无变化，保留原始记录。':''} ${s.note||''} ${s.frequency}统计；${s.unit}。仅比较本序列，不跨公司或口径合并。`,why:`检测到 ${rows.length} 个有效统计期、1个明确单位。${month?'月度结构适合年×月热力图；达到5个月的年度可展示箱线分布。':'按统计期绘制趋势。'}`,update:templateById.get('timeline').update});
 }
 const accepted=[...new Map(catalog.documents.filter(d=>d.classification.status==='accepted').map(d=>[d.id,d])).values()];
 for(const topic of ['',...catalog.industries.map(i=>i.topic)]){
  const docs=accepted.filter(d=>!topic||d.topic===topic);if(!docs.length)continue;
  const rows=docs.map(d=>({id:d.id,title:d.title,industry:d.topic,sourceId:d.sourceId,period:d.publishedAt,url:d.url,value:1}));
  generated.push({id:'hierarchy-'+key(topic),industry:topic||'全部领域',title:topic?topic+'：渠道与资料结构':'六大行业：来源与资料层级',types:['sunburst','treemap','tree'],renderer:'hierarchy',templateId:'hierarchy',rows,sources:sourcesFor(rows.map(r=>r.sourceId)),content:'行业 → 渠道 → 文章；每篇计1。面积代表资料数量，不代表产业规模。',why:`${docs.length} 篇去重文章具备行业、来源、文档三级结构：旭日图看层级占比，矩形树图看覆盖规模，树图查文章。`,update:templateById.get('hierarchy').update});
 }
 const dated=accepted.map(d=>({...d,publishedAt:publicationDay(d.publishedAt)})).filter(d=>d.publishedAt);
 for(const year of [...new Set(dated.map(d=>d.publishedAt.slice(0,4)))].sort().reverse().slice(0,3)){
  const rows=dated.filter(d=>d.publishedAt.startsWith(year)).map(d=>({title:d.title,period:d.publishedAt,sourceId:d.sourceId,url:d.url}));
  generated.push({id:'calendar-'+year,industry:'全部领域',title:year+'：资讯发布节奏',types:['calendar'],renderer:'calendar',templateId:'calendar',year,rows,sources:sourcesFor(rows.map(r=>r.sourceId)),content:'每个格子是已采集、通过行业规则的文章数；按原文发布日期，不是采集日期。',why:`${rows.length} 篇文章有合法发布日期，日历热力图适合查看报道集中出现的日期。空白仅表示本快照无资料。`,update:templateById.get('calendar').update});
 }
 const recipe=id=>id.startsWith('reports-')?'report-index':id==='fleet'?'multivariate':id.startsWith('relations-')?'relations':id==='coverage'?'allocation':id==='geography'?'geography':id==='buzios-share'?'composition':id==='ccs-plan'?'stages':['leases','lease-year'].includes(id)?'registry':null;
 const retained=catalog.cards.filter(c=>c.id!=='oil-month'&&c.rows?.length).map(c=>({...c,templateId:c.templateId||recipe(c.id),types:c.id==='fleet'?['parallel','scatter','bar']:c.id==='leases'?['sunburst','treemap','tree','pie']:c.types}));
 const order=c=>c.templateId==='hierarchy'&&c.industry==='全部领域'?0:({allocation:1,calendar:2,'metric-comparison':3,multivariate:3,registry:4,relations:5,hierarchy:6,timeline:7}[c.templateId]??8);
 const cards=[...generated,...retained].map(c=>({...c,templateVersion})).sort((a,b)=>order(a)-order(b));
 return {cards,planner:{version:templateVersion,decisions,templates:templates.map(t=>({...t,matches:cards.filter(c=>c.templateId===t.id).length})),newSources:catalog.sources.filter(s=>s.id.startsWith('mp2rss_')).map(s=>({...s,documents:catalog.documents.filter(d=>d.sourceId===s.id).map(d=>({title:d.title,url:d.url,status:d.classification.status,reason:d.classification.reason,extractionStatus:d.extractionStatus,metrics:catalog.observations.filter(o=>o.documentId===d.id).length}))}))}};
}
