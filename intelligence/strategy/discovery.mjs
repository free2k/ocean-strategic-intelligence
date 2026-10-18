import {standardTopics, canonicalTopic} from '../industry-topics.mjs';

export const DISCOVERY_VERSION = 'research-discovery-1.0';
export const researchDirections = [
  {id: 'development', name: '产业态势与竞争格局', description: '跟踪规模、结构、企业经营与项目进展。'},
  {id: 'decision', name: '技术路线与空间适宜性', description: '比较技术、项目或海域的适用条件与稳健性。'},
  {id: 'economics', name: '经济性与低碳转型', description: '在统一边界下比较成本、收益与净减排。'},
  {id: 'systems', name: '多能协同与系统配置', description: '研究资源互补、容量配置与供能约束。'},
  {id: 'policy', name: '政策治理与商业化', description: '跟踪政策工具、监管活动及商业化进程。'},
  {id: 'unclassified', name: '待核定分类', description: '缺少受控领域或研究方向，保留条目等待核定。'}
];
const directionIds = new Set(researchDirections.map(d => d.id));
const topicIds = new Set(standardTopics.map(d => d.id));
const industries = values => [...new Set((values || []).map(canonicalTopic).filter(id => topicIds.has(id)))];
const directionForTask = {statistics: 'development', evaluation: 'decision', economics: 'economics', scenario: 'economics', correlation: 'systems', optimization: 'systems', spatial: 'decision', network: 'policy', causal: 'policy', forecast: 'development'};
const topicName = id => standardTopics.find(t => t.id === id)?.name || '待核定领域';

// Classification reads published industry metadata and structured task/data fields.
// It neither guesses an industry from a title nor changes numerical readiness.
export function classifyRecommendation(item, catalog) {
  const series = item.dataset?.kind === 'series' ? (catalog.series || []).find(s => s.id === item.dataset.id) : null;
  const industryIds = industries(series ? [series.topic] : item.industryIds);
  let directionId = directionForTask[item.taskType] || 'unclassified';
  let ruleId = 'task-purpose';
  if (series && industryIds.includes('宏观政策')) {directionId = 'policy'; ruleId = 'policy-series';}
  else if (series) ruleId = 'comparable-series';
  if (!industryIds.length) {directionId = 'unclassified'; ruleId = 'missing-industry';}
  const source = series && (catalog.sources || []).find(s => s.id === series.sourceId);
  return {...item, classification: {
    version: DISCOVERY_VERSION, directionId, industryIds, taskTypes: [item.taskType], ruleId,
    dataForm: series ? 'comparable-series' : item.taskType === 'evaluation' ? 'evidence-to-matrix' : 'research-plan',
    reason: !industryIds.length ? '缺少已核定的标准领域，暂不凭标题猜测归属。' : series
      ? `沿用数据目录的${industryIds.map(topicName).join('、')}分类；${industryIds.includes('宏观政策') ? '监管发布统计归入政策治理' : '同口径时间序列归入产业态势'}，再按任务和可用状态筛选。`
      : `依据${industryIds.map(topicName).join('、')}领域与已登记的研究任务归组；资料线索不代表计算输入已齐备。`
  }, context: series ? {subject: series.name, sourceId: series.sourceId || '', sourceName: source?.name || series.sourceId || '', country: series.country || '', frequency: series.frequency || ''} : null};
}

export function classifyTemplate(template) {
  const industryIds = industries(template.classification?.industryIds);
  const declared = template.classification?.directionId;
  const valid = industryIds.length && directionIds.has(declared) && declared !== 'unclassified' && Object.hasOwn(directionForTask, template.taskType);
  return {...template, classification: {
    version: DISCOVERY_VERSION, directionId: valid ? declared : 'unclassified', industryIds,
    taskTypes: template.taskType ? [template.taskType] : [], ruleId: valid ? 'declared-research-design' : 'incomplete-research-design',
    reason: valid ? '依据主题登记的研究目标与适用领域分类；跨领域主题只在主方向计一次，可用领域标签交叉筛选。' : '主题尚未登记完整的研究方向或标准领域，保留在待核定分类。'
  }};
}

export function buildDiscovery(recommendations, templates) {
  const groups = new Map();
  for (const r of recommendations) {
    const id = r.dataset?.kind === 'series' ? 'series:' + r.dataset.id : r.id;
    let g = groups.get(id);
    if (!g) {
      g = {id, title: r.context?.subject || r.title, classification: r.classification, context: r.context, coverage: r.coverage, priority: r.priority, actions: []};
      groups.set(id, g);
    }
    g.actions.push(r.id);
    g.priority = Math.min(g.priority, r.priority);
  }
  const opportunities = [...groups.values()].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  return {
    version: DISCOVERY_VERSION,
    directions: researchDirections.map(d => ({...d, opportunities: opportunities.filter(x => x.classification.directionId === d.id).length, themes: templates.filter(x => x.classification.directionId === d.id).length})),
    industries: [...standardTopics.map(({id, name}) => ({id, name})), {id: 'unclassified', name: '待核定领域'}],
    opportunities,
    counts: {opportunities: opportunities.length, methods: recommendations.length, themes: templates.length},
    policy: '同一数据序列合并展示不同研究方法；分类随当前数据目录重算，分类不提高可计算状态。方向计数互斥，领域允许交叉。排序沿用数据前提优先级及稳定标识，不使用未经标定的价值分。'
  };
}
