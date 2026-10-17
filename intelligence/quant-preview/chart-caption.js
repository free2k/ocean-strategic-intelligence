import {topicLabel} from '../industry-topics.mjs';

// Explain the measured subject without changing the underlying records or scales.
export function chartCaption(card){
 const row=card.rows?.[0]||{},id=card.seriesId||'',unit=card.unit?`单位：${card.unit}`:'';
 const caption=(title,description)=>({title,description});
 const policy={'fr-boem-notice':['公告','Notice 类正式公告'],'fr-boem-rule':['最终规则','Rule 类最终规则'],'fr-boem-proposed-rule':['拟议规则','Proposed Rule 类拟议规则']};
 if(policy[id]){
  const [label,kind]=policy[id];
  return caption(`美国 BOEM 海上能源管理${label} · 月度发布数量`,`美国海洋能源管理局在 Federal Register 发布的 ${kind}；按正式发布日期、文件编号逐月去重计数，${unit||'单位：份'}。`);
 }
 if(id.startsWith('transocean-'))return caption(/transocean/i.test(card.title)?card.title:`Transocean ${card.title}`,`Transocean 公司全船队季度经营统计；${unit}。${id==='transocean-daily-revenue'?'平均日收入按作业日计算。':'按公司披露的同一指标口径对比各季度。'}`);
 const field=id.match(/^sodir-(troll|gullfaks|johan-sverdrup)-(oil|gas)$/);
 if(field){
  const name=field[1].replaceAll('-',' ').toUpperCase(),metric=field[2]==='oil'?'净原油产量':'净天然气产量';
  return caption(`挪威 ${name} 油气田 · ${metric}`,`SODIR 官方油气田历史统计，展示该田每月净产量总量；${unit}，原油与天然气分别统计。`);
 }
 if(id==='eia-offshore-crude'||card.id==='oil-month')return caption('美国联邦海域海湾原油 · 月度日均产量',`美国能源信息署 EIA 披露的海湾联邦海域原油产量；按月展示日均值，${unit}。`);
 if(card.id==='fleet')return caption('Transocean 海上钻井船队 · 季度经营三指标','对照全船队平台利用率、收入效率（%）与平均日收入（美元/作业日），仅展示三项数据齐全的共同季度。');
 if(card.id==='leases')return caption('美国 BOEM 海上风电租约 · 当前状态与授权结构','按租约编号去重，比较有效、到期及放弃等状态和授权类型；每份租约计 1 条。');
 if(card.id==='lease-year')return caption('美国 BOEM 海上风电租约 · 生效年份与当前状态','按租约生效年份分组，查看各年份租约在当前快照中的状态；数值为租约条数。');
 if(card.id==='registry-fr-boem')return caption('美国 BOEM 海上能源管理文件 · 正式发布类型分布','比较该机构在 Federal Register 发布的公告、最终规则等文件类型，按正式文件编号计数。');
 if(card.id==='registry-uk-repd')return caption('英国海洋可再生能源项目申请 · 当前开发状态','英国 DESNZ 的 REPD 登记数据，覆盖海上风电、潮汐及波浪能；按项目申请编号计数。');
 if(card.renderer==='official-distribution')return caption(/^IEA\b/.test(card.title)?card.title:`IEA ${card.title}`,'国际能源署原始工作簿中的项目／阶段登记，按国家或开发状态分组；同一原表行只计 1 条。');
 if(card.renderer==='official-capacity')return caption(/^IEA\b/.test(card.title)?card.title:`IEA ${card.title}`,`国际能源署${row.dataset?`《${row.dataset}》`:''}项目／阶段记录；${unit}${row.nature?`，${row.nature}`:''}，按所选开发状态和技术类型分别比较。`);
 if(card.renderer==='series')return caption(card.title,`${card.sources?.map(s=>s.name).join('、')||'原始来源'}披露的独立统计序列；${unit}，各统计期使用同一指标口径。`);
 if(card.renderer==='metric-comparison')return caption(card.title,`同一篇原文披露的${row.metricName||row.name||'指标'}，比较文中不同对象；${unit}${row.period?`，统计期：${row.period}`:''}。`);
 if(card.renderer==='hierarchy')return caption(`${card.industry==='全部领域'?'六大海洋能源领域':topicLabel(card.industry)} · 来源渠道与资料层级`,'展示行业、来源渠道与文章的层级及数量分布；每篇纳入文章计 1 条。');
 if(card.renderer==='calendar')return caption(`${card.year} 年海洋能源资讯 · 发布节奏`,'按原文发布日期统计当前范围内的纳入文章，展示每日发布量及时间分布。');
 if(card.id==='coverage')return caption('海洋能源资讯 · 来源渠道与行业覆盖','展示各渠道的纳入文章分布到六大海洋能源领域的数量，每篇文章归入一个主行业。');
 if(card.id==='geography')return caption('海洋能源报道 · 国家证据覆盖','根据原文证据统计各国被报道的文章数，同一国家内按文章去重。');
 if(card.id?.startsWith('relations-'))return caption(`${topicLabel(card.industry)} · 主体关系与原文证据`,'展示原文明确披露的企业、机构和项目之间的关系，连线方向对应证据中的主体与对象。');
 if(card.id==='buzios-share')return caption(card.title,'比较同一篇披露中巴西 Búzios 油田三方持有的权益百分比，合计为 100%。');
 if(card.id==='ccs-plan')return caption('Liverpool Bay 碳封存项目 · 分阶段年度能力规划','对照项目初期与扩容后披露的年度计划封存能力，单位：吨/年；各阶段分别展示。');
 if(card.id==='reports-宏观政策')return caption('海洋能源政策与研究报道 · 发布节奏','按原文发布日期与来源统计政策、研究类资料，展示报道数量及时间分布。');
 if(card.id==='reports-多能融合')return caption('海洋多能融合 · 资料与相关主体结构','展示纳入文章及文中关联的企业、机构和项目，沿资料层级查看原文主体。');
 return caption(card.title,(card.content||'').split('。')[0]+(card.content?'。':''));
}
