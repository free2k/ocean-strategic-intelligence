import {compute} from './engine.mjs';
// Inputs use a disclosed contractual upper limit and separately labelled research
// settings. No production article, extracted observation, or official series is edited.
export function caseRequests(spec) {
  const p = spec.scenarioParameters;
  const upper = spec.facts.find(f => f.label === '瑞典协议服务规模上限').value;
  const source = n => spec.sources.find(s => s.number === n);
  const annual = upper * p.unitNetCashEURPerTonne;
  const n = p.earningPeriods + p.delayPeriods + 1;
  const base = Array.from({length: n}, (_, t) => t === 0 ? -p.initialInvestmentEUR : t <= p.earningPeriods ? annual : 0);
  const delayed = Array.from({length: n}, (_, t) => t === 0 ? -p.initialInvestmentEUR : t <= p.delayPeriods ? 0 : annual);
  const common = {
    schemaVersion: 2, templateId: spec.templateId, confirmed: true,
    methodSelectionRequired: true,
    scope: {topic: spec.topic, country: 'NO,SE', sourceId: '', from: '', to: ''},
    review: {comparable: true, constraintsConfirmed: true, constraintScope:'scenario'}, constraints: [],
    provenance: {
      description: '研究展示案例。官方原文仅支持披露的源汇关系、协议上限与计划日期；所有财务参数均为自设情景，非任何真实项目的造价、报价或收益。',
      unit: '按各任务说明', period: '公开资料截至 ' + spec.asOf + '；情景为相对期间',
      urls: spec.sources.map(s => s.url), author: '公开资料案例整理',
      reason: spec.assumptions.map(a => a.label + '：' + a.value + '。' + a.explanation).join('\n')
    },
    configuration: {functionalUnit: '各任务单列单位；非净减排量', systemBoundary: spec.boundary, population: '库内所选官方披露关系与独立研究情景', baseYear: '研究设定口径，非项目实际基年', currencyBasis: '假设不变欧元；不含税、通胀、融资结构及残值', normalization: '不适用', period: '相对年度 t=0…12'}
  };
  const edges = [
    {from: 'Filbornaverket', to: 'Halmstad 港', type: '协议计划：公路运输', evidence: source(1).url + '；来源明确披露从厂区经公路至 Halmstad 港。'},
    {from: 'Halmstad 港', to: 'Øygarden 接收站', type: '协议计划：船运', evidence: source(1).url + '；来源明确披露从该港船运至挪威接收站。'},
    {from: 'Øygarden 接收站', to: '北方之光海底封存系统', type: '运行系统：海上管输及封存', evidence: source(3).url + '；首次注入已披露；不能将此解释为瑞典来源已注入。'},
    {from: 'Veas 试点', to: 'Øygarden 接收站', type: '运行试点：公路接入', evidence: source(3).url + '；Veas 来源接入并已披露首次注入。'}
  ];
  const inputs = {
    network: {taskType: 'network', input: {edges}, unit: '有证据的有向关系；连接度为相邻对象数'},
    volume: {taskType: 'scenario', input: {baseline: upper, shocks: p.fulfillmentShocks}, unit: '吨 CO₂ / 年；基准为协议上限，非实绩'},
    'npv-base': {taskType: 'economics', input: {cashflows: base, rate: p.baseDiscountRate}, unit: '欧元；一年一期，期末现金流'},
    'npv-rate': {taskType: 'economics', input: {cashflows: base, rate: p.stressDiscountRate}, unit: '欧元；一年一期，期末现金流'},
    'npv-delay': {taskType: 'economics', input: {cashflows: delayed, rate: p.baseDiscountRate}, unit: '欧元；一年一期，期末现金流'}
  };
  return spec.tasks.map(task => {
    const settings = inputs[task.key];
    const request = structuredClone(common);
    Object.assign(request, {requestId: spec.id + '-20261018-'+(spec.revision||'v1')+'-' + task.key, title: '北方之光案例｜' + (task.method === 'npv' ? '附属接收环节条件性投资情景' : task.label), method: task.method, taskType: settings.taskType, input: settings.input});
    request.provenance.unit = settings.unit;
    if(spec.workflow){
      request.title=task.method==='npv'?spec.workflow.title:'海上CCUS源汇匹配与投资时序｜'+task.label;
      request.scope.from='2026-01-01';request.scope.to=spec.asOf;
      request.provenance.period='公开证据 2026-01-01 至 '+spec.asOf+'；现金流使用相对年度 t=0…12';
      request.configuration={...request.configuration,functionalUnit:task.method==='npv'?'一个假设附属接收环节，在共同观察窗内的净现值（欧元）':settings.unit,population:'瑞典 Filbornaverket—Halmstad 港—挪威 Øygarden—海底封存系统；Veas 为已披露运行对照',systemBoundary:'公开源汇关系与附属接收环节简化现金流；包含假设初始支出和年净现金贡献。排除完整捕集成本、税、通胀、残值、融资结构与生命周期净减排；不是整体项目估值。',baseYear:'2026 年不变欧元（研究情景设定；非真实工程造价基年，未作物价平减）',period:request.provenance.period};
      request.researchNotes={question:spec.workflow.decisionQuestion,methodRationale:task.why,findings:task.method==='npv'?['计算采用统一观察窗、假设现金流和明确折现率；对比版本分别检验资金成本与收入延后。','结论仅对当前研究设定成立，不能据此判断真实项目是否值得投资。']: [task.why],limitations:spec.workflow.coverage,nextSteps:spec.workflow.gaps.join('；')};
      if(task.method==='npv'){
        const computed=compute('npv',request.input).result.npv;
        request.researchNotes.findings.unshift('本版本在给定研究设定下的 NPV 为'+(computed>=0?'正':'负')+'；数值与冻结输入由本版本计算结果支持。');
        if(task.key==='npv-rate')request.researchNotes.findings.unshift('与当前基准版本保持相同现金流，仅提高折现率，检验资金成本压力。');
        if(task.key==='npv-delay')request.researchNotes.findings.unshift('共同观察窗、初始支出与未折现收入总额不变；收入晚两期，检验时间价值风险。');
      }
      request.revisionReason='补齐案例研究问题、系统边界、参数依据与结果研判，保留原始计算版本。';
    }
    if (task.key === 'npv-rate') request.revisionReason = '现金流与共同期间不变，将自设折现率从基准提高到压力水平；非实际融资成本变动。';
    if (task.key === 'npv-delay') request.revisionReason = '共同观察窗和初始支出不变，设定收入晚两期；此为时序情景，不是最优年份求解。';
    return {...task, request};
  });
}
