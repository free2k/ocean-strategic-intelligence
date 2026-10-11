// Declarative template contracts. Model text never becomes executable chart code.
export const templateVersion='templates-v1';
export const templates=[
 {id:'report-index',types:['scatter','tree'],name:'报道时间与实体索引',requires:'通过行业筛选的资料，有发布日期或实体关联；不将报道日期解释为项目生效日期',update:'文档ID去重，新版本重新关联实体。'},
 {id:'metric-comparison',types:['dot','boxplot'],name:'文章同指标对象对比',requires:'同篇披露、相同指标名称（允许去除逐字对象前缀）/单位/性质/统计期，至少两个不同对象；数值逐字匹配证据，不自动合并同义词',update:'同一文档版本重算；不同披露不混合，冲突数值退出绘图。'},
 {id:'timeline',types:['line','heatmap','boxplot'],name:'统计时序与分布',requires:'同一官方序列、有限数值、合法统计期；箱线图每组至少5个样本',update:'序列ID＋统计期去重，新期追加，同期修订覆盖；缺失不补零。'},
 {id:'hierarchy',types:['sunburst','treemap','tree'],name:'行业—渠道—文章层级',requires:'已通过行业规则的去重文章；叶节点每篇计1，不代表规模或产能',update:'文档ID去重；新文章、行业调整和来源变化重新聚合。'},
 {id:'calendar',types:['calendar'],name:'文章发布日历',requires:'有合法发布日期的已纳入文章；按天计数，非行业活动总量',update:'按文档ID去重后按发布日期重新计数；未采集到文章的日期不等于没有行业事件。'},
 {id:'relations',types:['graph'],name:'有证据的实体网络',requires:'主体、对象、关系和匹配原文证据齐全；共现不能代替关系',update:'关系与证据ID去重；保留人工排除结果。'},
 {id:'multivariate',types:['parallel','scatter','bar'],name:'同对象多指标',requires:'同一主体、共同统计期、明确单位；不同单位分轴呈现',update:'仅取共同统计期，不补齐缺失指标。'},
 {id:'registry',types:['sunburst','treemap','tree','pie','heatmap'],name:'登记表层级与分布',requires:'登记记录有唯一键、分类和状态；计数不等于容量',update:'登记编号去重，修订状态覆盖当前快照。'},
 {id:'allocation',types:['sankey'],name:'来源到行业的资料分配',requires:'每篇文章分配到一个主行业，边宽表示文章数',update:'文档去重后重新聚合；不是资金或能源流。'},
 {id:'geography',types:['map'],name:'国家证据覆盖',requires:'国家关联有证据；显示国家覆盖，不推断项目精确坐标',update:'每篇每国最多计一次。'},
 {id:'composition',types:['pie'],name:'完整组成',requires:'同一总体、同次完整披露，互斥且合计100%',update:'采用最新完整披露，不跨版本拼接。'},
 {id:'stages',types:['bar'],name:'项目阶段能力',requires:'同一项目、同口径单位及明确阶段，计划与实际分开',update:'按项目、阶段和披露版本更新。'},
 {id:'radar',types:['radar'],name:'标准化多维比较',requires:'统一评价基准、指标方向、标准化范围和完整维度；目前未配置',blocked:'缺少可审计的统一评价基准'},
 {id:'funnel',types:['funnel'],name:'项目阶段转化',requires:'同一批项目有连续阶段历史及明确分母',blocked:'当前只有状态快照，不能推断转化'},
 {id:'candlestick',types:['candlestick'],name:'开高低收',requires:'同一周期的真实开盘、最高、最低、收盘值',blocked:'当前没有OHLC数据'},
 {id:'route',types:['lines'],name:'真实运输路径',requires:'有证据的起终点坐标及路径定义',blocked:'当前未提供可靠的项目路径坐标'}
];
export const templateById=new Map(templates.map(t=>[t.id,t]));
