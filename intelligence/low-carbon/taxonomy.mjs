import {lowCarbonLexicons,lowCarbonContext,lowCarbonExclusions} from './lexicon.mjs';
export const lowCarbonTopics=[
 {id:'lc_ccus_removal',name:'CCUS与碳移除',definition:'二氧化碳捕集、运输、利用、封存、碳移除及具有碳汇研究对象的蓝碳项目。',boundary:'分别标注避免排放、利用、移除和自然碳汇；普通工业气体采购和无碳汇内容的生态新闻不纳入。',keywords:['碳捕集','二氧化碳捕集','二氧化碳运输','碳封存','地质封存','源汇匹配','碳矿化','直接空气捕集','碳移除','海洋碳汇','蓝碳','CCUS','carbon capture','CO2 transport','CO₂ transport','carbon storage','carbon dioxide removal','direct air capture','blue carbon'],groups:[['二氧化碳','CO2','CO₂'],['捕集','运输','封存','矿化','capture','storage','sequestration']]},
 {id:'lc_efficiency_recovery',name:'节能工艺与余能利用',definition:'生产和运行环节的节能工艺、余热余压余气利用、火炬气回收及甲烷泄漏控制。',boundary:'需有明确能效或减排应用；单纯增产降本不纳入。装备本体研发制造归装备材料。',keywords:['节能改造','工艺节能','能效提升','余热回收','余热发电','余压利用','余气利用','低温余热','热集成','梯级用能','蒸汽系统优化','火炬气回收','甲烷减排','泄漏检测与修复','waste heat recovery','heat integration','flare gas recovery','methane abatement','energy efficiency'],groups:[['工艺','流程','供热','蒸汽','甲烷','天然气','process','methane'],['节能','能耗','回收','泄漏修复','energy efficiency','recovery','leak detection']]},
 {id:'lc_clean_energy_integration',name:'清洁能源与多能协同',definition:'低碳能源生产、能源替代、风光储氢协同、综合能源、岸电及平台电气化。',boundary:'氢、甲醇、氨、储能须明确能源来源或低碳应用；常规油气增产不因能源属性纳入。',keywords:['海上风电','漂浮式风电','海上光伏','波浪能','潮汐能','潮流能','绿氢','可再生能源制氢','绿色甲醇','绿氨','绿电替代','源网荷储','风光储氢','多能互补','综合能源系统','能源岛','平台电气化','港口岸电','offshore wind','renewable energy','green hydrogen','green ammonia','shore power','electrification'],groups:[['储能','微电网','氢','甲醇','solar','hydrogen','storage'],['可再生','绿电','低碳供能','协同','renewable','decarbonisation','decarbonization']]},
 {id:'lc_equipment_materials',name:'绿色装备与低碳材料',definition:'直接用于节能降碳的装备、材料研发制造和低碳替代，包括捕集材料和再制造。',boundary:'普通装备交付、国产化和材料订单不自动纳入；以工厂节能应用为主归工艺领域。',keywords:['高效电机','节能泵','节能压缩机','工业热泵','碳捕集装备','二氧化碳分离膜','捕集吸收剂','碳捕集吸附剂','低碳钢','低碳水泥','低熟料水泥','低碳胶凝材料','装备再制造','低碳材料','industrial heat pump','carbon capture equipment','low-carbon steel','low-carbon cement','low-carbon materials','remanufacturing'],groups:[['装备','材料','电机','压缩机','吸附剂','分离膜','equipment','material'],['节能','能效','低碳','捕集','energy-efficient','low-carbon','carbon capture']]},
 {id:'lc_digital_carbon_management',name:'数智降碳与碳管理',definition:'数字技术用于能耗优化、碳排放监测核算、诊断、调度和碳数据管理。',boundary:'通用 AI、数字孪生或办公软件不纳入；制度和标准发布归战略市场领域。',keywords:['数智降碳','能碳管理','能源管理系统','能耗在线监测','碳排放监测','碳排放核算','碳核算','产品碳足迹','碳足迹核算','AI节能','人工智能节能','智能能效诊断','能源数字孪生','碳数据质量','energy management system','carbon accounting','carbon footprint','carbon emissions monitoring','life cycle assessment','digital energy management'],groups:[['AI','人工智能','数字孪生','智能调度','预测性维护','MRV','digital twin'],['能耗','节能','能效','排放','碳核算','energy efficiency','carbon emissions']]},
 {id:'lc_strategy_market',name:'低碳战略与市场机制',definition:'低碳战略规划、转型路线、政策标准、碳市场、碳资产、绿色金融和管理制度。',boundary:'泛宏观经济、普通金融和无气候内容的 ESG 宣传不纳入。以技术项目为主归相应技术领域。',keywords:['碳达峰','碳中和','双碳规划','低碳转型战略','减碳路线图','碳预算','碳排放权交易','碳市场','碳配额','碳定价','碳资产管理','低碳标准','绿色供应链管理','转型金融','绿色管理体系','carbon neutrality','decarbonisation roadmap','decarbonization roadmap','net-zero strategy','emissions trading','carbon market','carbon pricing','transition finance'],groups:[['政策','规划','标准','制度','市场','policy','regulation','strategy'],['低碳','碳排放','能效','碳交易','CCUS','carbon','decarbonisation']]}
].map(t=>({...t,...lowCarbonLexicons[t.id],keywords:lowCarbonLexicons[t.id].titleKeywords,aliases:[t.id,t.name]}));
export function lowCarbonSeedRules(){
 const context=lowCarbonContext();let id=0;
 const rule=(type,topic,description,lexicon,priority,groups=[])=>({id:++id,type,topic,description,title_keywords:lexicon.titleKeywords,content_keywords:lexicon.contentKeywords,priority,enabled:true,require_all:false,groups});
 return {rules:[
  rule('context',null,'通用低碳语境：六领域共用，只检查标题和正文前1800字符的低碳范围，不直接决定领域。停用或清空后不自动恢复默认词表。',context,0),
  rule('exclude',null,'六领域通用反向筛选：复用原站明确的广告、招聘、股票财报、娱乐、招生及活动通知词，并扩展英文；保留低碳项目投资、碳市场价格、能效指数、公开研究等专业内容。',lowCarbonExclusions,1),
  ...lowCarbonTopics.map(t=>rule('include',t.id,t.definition+' 边界：'+t.boundary+' 标题使用专业短语；正文增加技术环节、应用和中英文变体；组合条件必须在同一段成立。',t,10,t.groups))
 ]};
}
export function classifyLowCarbon(record,compiled,hasTerm){
 const visible=s=>String(s||'').replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&');
 const title=visible([record.title,record.titleZh].filter(Boolean).join(' ')),content=visible([record.content,record.contentZh].filter(Boolean).join('\n'));
 const rawParagraphs=content.split(/[\r\n\u2028\u2029]+|(?<=[。！？!?])\s*/).map(s=>s.trim()).filter(Boolean);
 const footer=rawParagraphs.findIndex(s=>/^(参考文献|相关阅读|推荐阅读|延伸阅读)/i.test(s)||/^(references|related articles)\s*:?\s*$/i.test(s));
 const contentParagraphs=footer<0?rawParagraphs:rawParagraphs.slice(0,footer),paragraphs=[title,...contentParagraphs];
 // A literal keyword cannot cross the LF paragraph separator. Scan the joined
 // body once per phrase; reserve paragraph iteration for grouped conditions.
 const cleanContent=contentParagraphs.join('\n');
 const hitsFor=(r,body=cleanContent)=>[...(r.title_keywords||[]).filter(k=>hasTerm(title,k)).map(keyword=>({keyword,field:'标题'})),...(r.content_keywords||[]).filter(k=>hasTerm(body,k)).map(keyword=>({keyword,field:'正文'}))];
 const positive=[],negative=[];
 for(const r of compiled.rules){if(r.enabled===false||r.type==='context')continue;const hits=hitsFor(r);
  if(r.type==='exclude'){negative.push(...hits);continue;}
  if(!lowCarbonTopics.some(t=>t.id===r.topic))continue;
  const groupParagraph=(r.groups||[]).length?paragraphs.find(p=>r.groups.every(g=>g.some(k=>hasTerm(p,k)))):null;
  if(r.require_all?!groupParagraph:!hits.length&&!groupParagraph)continue;
  const keywords=hits.length?hits:r.groups.flatMap(g=>g.filter(k=>hasTerm(groupParagraph,k))).map(keyword=>({keyword,field:'同段组合条件'}));
  positive.push({topic:r.topic,origin:'低碳独立规则',keywords,priority:r.priority??99});
 }
 // Persisted common-context rules are authoritative, including deliberately
 // empty/disabled lists. Rule-only callers without a context row retain the
 // explicit professional-term / same-paragraph behavior (no hidden defaults).
 const contextRules=compiled.rules.filter(r=>r.type==='context');
 const contextHits=contextRules.filter(r=>r.enabled!==false).flatMap(r=>hitsFor(r,cleanContent.slice(0,1800)).map(h=>({...h,field:h.field==='正文'?'正文前1800字符':h.field})));
 const inScope=contextRules.length?contextHits.length>0:positive.length>0;
 const matched=[...new Set(positive.map(p=>p.topic))];
 let primary=[...matched].sort((a,b)=>score(b)-score(a))[0]||null;
 function score(t){return positive.filter(p=>p.topic===t).reduce((n,p)=>n+p.keywords.reduce((s,k)=>s+(hasTerm(title,k.keyword)?8:hasTerm(content.slice(0,500),k.keyword)?3:1),0),0);}
 const preferences=[['lc_strategy_market',/发布.*(?:政策|规划|标准|办法)|碳市场|碳配额|碳定价|管理办法|policy|regulation|carbon market/i],['lc_digital_carbon_management',/数字孪生|能碳管理|碳核算|智能调度|digital twin|carbon accounting/i],['lc_equipment_materials',/(?:研发|研制|发布|交付).*(?:热泵|电机|材料|装备)|low-carbon steel|low-carbon cement/i],['lc_efficiency_recovery',/工厂|改造|余热|甲烷|火炬气|waste heat|methane/i]];
 for(const [topic,re] of preferences)if(matched.includes(topic)&&re.test(title)){primary=topic;break;}
 const status=negative.length?'excluded':inScope&&primary?'accepted':'unmatched';
 return {status,primary:status==='accepted'?primary:null,topics:status==='accepted'?matched:[],positive,negative,context:{matched:inScope,basis:contextRules.length?'数据库通用低碳语境词':'显式低碳专业词或同段组合语境',hits:contextHits},reason:negative.length?'命中六领域通用反向排除规则':!inScope?'缺少标题或正文前1800字符的低碳语境':primary?'低碳专业词与公共语境匹配':'尚无明确低碳技术、能碳应用或治理依据',primaryBasis:'反向优先；公共语境仅检查范围；标题及正文主旨确定主领域，辅助领域保留；组合条件须同段成立',version:compiled.version,method:'rules'};
}
