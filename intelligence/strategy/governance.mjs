import {invalid, matrixMethods, isObject} from './contracts.mjs';
import {canonicalTopic} from '../industry-topics.mjs';

import {taskMap as tasks,taskNames} from '../public/strategy/task-map.js';
export {taskNames};
export function matchMethods(questionType='evaluation', dataProfile={}, methods=[]) {
  const ids=tasks[questionType]||[];
  return methods.filter(m=>ids.includes(m.id)).map(m=>{
    let dataStatus='needs-data',reason='须补齐并核定：'+m.input;
    if(dataProfile.structure==='series'&&['describe','growth','cagr','trend','moving'].includes(m.id)) {dataStatus='needs-review';reason='已选择官方同口径序列；仍须确认期间与专属前提';}
    if(dataProfile.structure==='matrix'&&matrixMethods.has(m.id)){dataStatus='needs-review';reason='对象×指标矩阵适合多准则比较；先核定可比性与硬约束';}
    if(dataProfile.structure==='series'&&matrixMethods.has(m.id)){dataStatus='not-applicable';reason='单一时序不能替代方案×指标矩阵';}
    if(questionType==='economics')reason=m.id==='npv'?'NPV采用分期现金流；完整TEA/LCOH或LCA仍需专用清单与引擎':'需要技术经济清单、统一功能单位和系统边界；不能用综合评分替代';
    if(questionType==='causal')reason='需要处理/对照、时点、混杂控制及识别假设；相关和排序不能回答因果问题';
    if(questionType==='optimization')reason='需要同期逐时资源、决策变量、目标和可行域；优化求解器待接入';
    return {methodId:m.id,name:m.name,engineStatus:m.status==='ready'?'accepted':'planned',dataStatus,reason,preconditions:m.minimum,diagnostics:m.caution};
  });
}

export function checkStudyReadiness(study, methods) {
  const method=methods.find(m=>m.id===study.method),constraints=study.constraints||[],missingFields=[],fieldErrors=[];
  let dataStatus='ready';
  if(constraints.some(c=>c.status==='fail')){dataStatus='not-applicable';fieldErrors.push(...constraints.filter(c=>c.status==='fail').map(c=>({field:'constraints',objectId:c.objectId,message:'硬约束冲突：'+c.reason})));}
  else if(!study.dataset&&!isObject(study.input)){dataStatus='needs-data';missingFields.push('核定输入');}
  else if(study.taskType&&!(tasks[study.taskType]||[]).includes(study.method)){dataStatus='not-applicable';fieldErrors.push({field:'method',message:'方法与研究问题不匹配，请选择专属研究设计'});}
  else if(constraints.some(c=>c.status==='pending')||study.confirmed!==true||study.review?.comparable===false||study.review?.constraintsConfirmed===false||study.input?.cellEvidence?.some(e=>e.reviewStatus!=='verified')){dataStatus='needs-review';missingFields.push('数据、来源、可比性及硬约束核定');}
  const engineStatus=method?.status==='ready'?'accepted':'planned';
  const status=dataStatus==='not-applicable'?'not-applicable':dataStatus==='needs-data'?'needs-data':engineStatus==='planned'?'engine-pending':dataStatus==='needs-review'?'needs-review':'ready';
  return {engineStatus,dataStatus,status,canExecute:status==='ready',missingFields,fieldErrors};
}

export function validateParameterChanges(previous, patch, actor={id:'authenticated-researcher'}) {
  if(!isObject(patch)||!['fact','preference','scenario','decision','constraint','output'].includes(patch.parameterClass))invalid('请明确参数类别',[{field:'parameterChanges.parameterClass',message:'六类参数之一'}]);
  const {parameterClass,values,reason}=patch;
  if(!isObject(values))invalid('参数修改须为对象');
  const allowed={preference:['weights','weightMethod','judgments','scan'],scenario:['rate','shocks'],constraint:['functionalUnit','systemBoundary','baseYear','population','currencyBasis','period','normalization']};
  if(!allowed[parameterClass]||Object.keys(values).some(k=>!allowed[parameterClass].includes(k)))invalid('事实观测与计算输出只读；偏好或情景不能改写官方事实。事实纠错须走原数据核定流程并保留数据版本。',[],403,'PARAMETER_READ_ONLY');
  if(typeof reason!=='string'||!reason.trim())invalid('修改须注明依据',[{field:'parameterChanges.reason',message:'填写修改原因与依据'}]);
  return {parameterClass,values,reason,actor:actor.id,previousVersionId:previous?.id||null,requiresNewConfiguration:parameterClass==='constraint'};
}

export function templateReadiness(template, catalog) {
  const topics=new Set((template.seriesTopics||[]).map(canonicalTopic));
  const series=(catalog.series||[]).filter(s=>s.unit&&s.rows?.length>=2&&topics.has(canonicalTopic(s.topic)));
  return {...template,engineStatus:template.engineProfile||'partial-or-planned',dataStatus:series.length?'needs-review':'needs-data',canExecute:false,
    liveReadiness:series.length?`发现${series.length}条相关官方序列，仅作数据线索；须核定对象、口径和完整输入后建立具体任务。`:'当前尚未核定主题所需完整数据；'+template.dataRequirements,
    missingFields:series.length?['确认具体序列、对象总体、研究期间及主题所需的其余输入']:[template.dataRequirements],
    updatePolicy:'人工审核新数据及口径后另建版本；未启用自动提醒或后台复算'};
}
