import {compute} from './engine.mjs';

export function evaluationCaseRequests(spec){
 const e=spec.evaluation;
 return spec.tasks.map(task=>{
  const matrix=structuredClone(task.key==='entropy-schedule'?e.updatedMatrix:e.matrix);
  const indicators=e.indicators.map(i=>({...i,nature:'demo',frequency:'同一设计窗口',comparableScope:e.period}));
  const input={matrix,labels:e.objects.map(o=>o.label),objectIds:e.objects.map(o=>o.id),indicators:indicators.map(({direction,...i})=>i),directions:indicators.map(i=>i.direction),weightMethod:task.method==='weighted'?'equal':'entropy',cellEvidence:matrix.flatMap((row,i)=>row.map((value,j)=>({objectId:e.objects[i].id,indicatorId:indicators[j].indicatorId,value,period:e.period,nature:'demo',reviewStatus:'verified',reviewedBy:'案例情景设定整理，非专家评分',sourceRef:'研究情景矩阵｜'+spec.id+'｜'+task.key+'｜'+e.objects[i].label+'｜'+indicators[j].name+'。该数值无企业原表依据；官方链接仅支持共同路线与服务目标背景：'+spec.sources[0].url,quote:'人工预填的研究情景值；不冒充项目实际数据。'}))),scan:{type:'nine-point',indicatorIndex:0}};
  const constraints=e.objects.map((o,i)=>({id:'constraint-'+o.id,objectId:o.id,status:'pass',reason:'仅通过本情景数值约束：保障能力 '+matrix[i][3]+' 吨/年不低于协议上限 '+e.serviceTarget+' 吨/年；准备期 '+matrix[i][2]+' 月不超过自设 '+e.maxReadinessMonths+' 月。实际许可、安全和运力未核验，本次不判断实际可实施性。'}));
  if(constraints.some((_,i)=>matrix[i][3]<e.serviceTarget||matrix[i][2]>e.maxReadinessMonths))throw Error('情景约束冲突，不能标记通过');
  const result=compute(task.method,input).result;
  const provenance={description:'库内官方资料支持瑞典—挪威 CO₂ 接入背景、共享物流与协议服务上限；评价矩阵的成本、投入、准备期、保障能力和排放均为逐格标记的研究情景，不是企业报价或项目实绩。需求达标后继续比较扩容与冗余能力，其收益偏好是研究设定，不是无条件认定越大越经济。',unit:'各指标单位见表头；不合并不同单位原值',period:e.period,urls:spec.sources.map(s=>s.url),author:'案例研究情景整理，非专家调查',reason:spec.assumptions.map(a=>a.label+'：'+a.value+'。'+a.explanation).join('\n')};
  const configuration={functionalUnit:'在共同研究窗口内提供至少满足协议参考服务目标的瑞典—挪威 CO₂ 运输接入服务，并比较未来扩容与冗余能力；输出为无量纲相对得分',systemBoundary:spec.boundary+' 成本仅运输接入可变费用与接口投入；不含资本折旧、捕集、液化和永久封存收费。',population:e.objects.map(o=>o.label).join('；')+'。均为研究设计，不是真实企业排名。',baseYear:'2026 年不变欧元（研究情景设定；未作真实工程报价或物价平减）',currencyBasis:'可变成本为欧元/吨；接口投入为百万欧元；标准化后比较，不直接加总原值',normalization:'min-max-v1',period:e.period};
  const researchNotes={question:spec.workflow.decisionQuestion,methodRationale:task.why,findings:['本输入下的相对排序为：'+result.ranking.map(r=>r.label).join(' → ')+'。数值来自本版本确定性计算。',task.method==='weighted'?'等权是本次研究偏好设定，不代表专家共识或政策权重；WSM 得分仅用于本次对象之间的相对比较。':'熵权反映本情景矩阵的差异，不等于政策或社会偏好；得分不代表绝对水平。','权重扰动和九点扫描用于条件性稳健性检查，不代表概率、置信区间或统计显著性。'],limitations:spec.workflow.coverage,nextSteps:spec.workflow.gaps.join('；')};
  if(task.key==='entropy-schedule')researchNotes.findings.push('本版同时重算列归一化与熵权，其他方案的得分也可能改变；不能把排序差异单独归因于工期缩短。');
  return {...task,request:{schemaVersion:2,requestId:spec.id+'-'+spec.revision+'-'+task.key,title:spec.workflow.title,taskType:'evaluation',method:task.method,templateId:spec.templateId,scope:{topic:spec.topic,country:'NO,SE',sourceId:'',from:'2026-01-01',to:spec.asOf},input,configuration,provenance,constraints,review:{comparable:true,constraintsConfirmed:true,constraintScope:'scenario'},confirmed:true,methodSelectionRequired:true,researchNotes,...(task.parentKey?{revisionReason:'假设通过追加投入将专用方案准备期缩短，其余对象与指标口径不变；不是实际工程修订。'}:{})}};
 });
}
