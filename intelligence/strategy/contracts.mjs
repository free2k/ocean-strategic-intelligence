import {StrategyError} from './engine.mjs';

export const matrixMethods = new Set(['equal','manual','entropy','critic','weighted','topsis','entropy-topsis','ahp-topsis','rank-robustness']);
export const seriesMethods = new Set(['describe','growth','cagr','trend','moving']);
export const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = v => typeof v === 'number' && Number.isFinite(v);
export function invalid(message, fieldErrors = [], status = 400, code = 'INVALID_INPUT') {
  throw Object.assign(new StrategyError(message, status), {code, fieldErrors});
}

// Public input is checked before any property access or calculation. Paths also identify
// the corresponding control in the wizard; legacy global provenance remains readable.
export function validateRequest(r) {
  const errors = [];
  const add = (field, message, extra = {}) => { if (errors.length < 200) errors.push({field, message, ...extra}); };
  if (!isObject(r)) invalid('研究请求必须是对象', [{field:'request',message:'须为对象'}]);
  for (const k of ['title','method']) if (typeof r[k] !== 'string' || !r[k].trim() || r[k].length > (k==='title'?200:100)) add(k, '必须填写有效文本');
  for (const k of ['scope','input','provenance','configuration','review','parameterChanges']) if (r[k] !== undefined && !isObject(r[k])) add(k, '须为对象');
  for (const k of ['requestId','studyId','parentId','parentVersionId','engineVersion','parameterVersion','taskType','changeClass','runMode','templateId','revisionReason']) if (r[k] != null && (typeof r[k] !== 'string' || r[k].length > 2000)) add(k, '须为文本');
  if (r.requestId !== undefined && !/^[\w.-]{8,128}$/.test(r.requestId)) add('requestId','请求标识须为8—128位字母、数字、点、横线或下划线');
  if (r.methodSelectionRequired !== undefined && typeof r.methodSelectionRequired !== 'boolean') add('methodSelectionRequired','须为布尔值');
  if (r.methodSelection !== undefined && (!isObject(r.methodSelection) || typeof r.methodSelection.token !== 'string' || r.methodSelection.token.length > 40000)) add('methodSelection','须为有效的方法确认凭据');
  if (r.dataset != null && (!isObject(r.dataset) || r.dataset.kind !== 'series' || typeof r.dataset.id !== 'string' || !r.dataset.id.trim())) add('dataset','须指定有效的官方序列ID');
  if (isObject(r.scope)) for (const [k,v] of Object.entries(r.scope)) if (!['topic','country','sourceId','from','to'].includes(k) || typeof v !== 'string' || v.length > 120) add('scope.'+k,'范围须为有效文本');
  if (r.scope?.from && r.scope?.to && r.scope.from > r.scope.to) add('scope.to','截止日期不能早于起始日期');
  if (isObject(r.provenance)) {
    for (const k of ['description','unit','period','author','reason']) if (r.provenance[k] !== undefined && (typeof r.provenance[k] !== 'string' || r.provenance[k].length > 4000)) add('provenance.'+k,'须为有效文本');
    if (r.provenance.urls !== undefined && (!Array.isArray(r.provenance.urls) || r.provenance.urls.length > 100 || r.provenance.urls.some(u=>typeof u!=='string'||!/^https?:\/\/[^\s]+$/i.test(u)))) add('provenance.urls','来源链接须为HTTP(S)地址');
  }
  if (isObject(r.configuration)) for (const [k,v] of Object.entries(r.configuration)) if (!['functionalUnit','systemBoundary','baseYear','population','currencyBasis','normalization','period'].includes(k) || typeof v !== 'string' || v.length>1000) add('configuration.'+k,'须为受支持的口径文本');
  if (r.constraints !== undefined) {
    if (!Array.isArray(r.constraints) || r.constraints.length > 500) add('constraints','最多500项硬约束');
    else r.constraints.forEach((c,i)=>{if(!isObject(c)||typeof c.id!=='string'||!['pass','fail','pending'].includes(c.status)||typeof c.reason!=='string'||!c.reason.trim())add(`constraints.${i}`,'硬约束须含编号、核验状态与依据');else for(const k of ['objectId','evidence'])if(c[k]!==undefined&&typeof c[k]!=='string')add(`constraints.${i}.${k}`,'须为文本');});
  }
  if (isObject(r.review)) for (const k of ['comparable','constraintsConfirmed']) if (r.review[k] !== undefined && typeof r.review[k] !== 'boolean') add('review.'+k,'须为布尔值');
  // Browser-supplied platform values are intentionally ignored, including malformed replacements.
  if (!r.dataset && isObject(r.input)) validateInput(r.method, r.input, add);
  if (r.dataset && isObject(r.input) && r.input.window!==undefined && (!Number.isInteger(r.input.window)||r.input.window<2)) add('input.window','平滑窗口须为不小于2的整数');
  if (r.schemaVersion===2 && !r.dataset && matrixMethods.has(r.method) && !Array.isArray(r.input?.cellEvidence)) add('input.cellEvidence','每个矩阵单元格必须有来源核定');
  if (!r.dataset && (!isObject(r.provenance) || !r.provenance.description?.trim?.() || !r.provenance.unit?.trim?.() || !r.provenance.period?.trim?.())) add('provenance','来源说明、单位与研究期间必填');
  if(r.schemaVersion===2&&!r.dataset&&isObject(r.input)){const mode=r.method==='ahp'||r.method==='ahp-topsis'?'ahp':r.method==='entropy-topsis'?'entropy':['equal','manual','entropy','critic'].includes(r.method)?r.method:r.input.weightMethod;if(['manual','ahp'].includes(mode)){if(typeof r.provenance?.author!=='string'||!r.provenance.author.trim())add('provenance.author','专家权重或AHP须填写判断人');if(typeof r.provenance?.reason!=='string'||!r.provenance.reason.trim())add('provenance.reason','专家判断须记录理由与聚合规则');}if(['npv','scenario'].includes(r.method)&&!r.provenance?.reason?.trim?.())add('provenance.reason','折现率或外生情景须注明范围与来源依据');}
  if (errors.length) invalid(`输入存在${errors.length}项问题：${errors.slice(0,3).map(e=>e.message).join('；')}`,errors);
  return r;
}

export function validateInput(method, x, add) {
  for(const key of Object.keys(x))if(!['matrix','labels','objectIds','directions','indicators','weights','weightMethod','judgments','cellEvidence','scan','rows','values','other','cashflows','rate','baseline','shocks','edges','window','completeUniverse','valueEvidence'].includes(key))add('input.'+key,'输入字段不在方法契约中');
  if(x.valueEvidence!==undefined&&(!Array.isArray(x.valueEvidence)||x.valueEvidence.some(v=>!isObject(v)||typeof v.label!=='string'||typeof v.sourceRef!=='string'||!finite(v.value))))add('input.valueEvidence','数值来源须含对象/期间、有效数值和来源文本');
  const numbers = (key, min=2, max=5000) => {
    if (!Array.isArray(x[key]) || x[key].length<min || x[key].length>max) return add('input.'+key,`需要${min}—${max}个数值`);
    x[key].forEach((v,i)=>{if(!finite(v))add(`input.${key}.${i}`,'必须填写有限数值；空白不补零');});
  };
  if (matrixMethods.has(method)) {
    if (!Array.isArray(x.matrix) || x.matrix.length<2 || x.matrix.length>500) return add('input.matrix','需要2—500个对象');
    const n = Array.isArray(x.matrix[0]) ? x.matrix[0].length : 0;
    if(n<2||n>30)add('input.indicators','需要2—30个指标');
    for(const k of ['labels','directions','indicators']) if(!Array.isArray(x[k])||x[k].length!==(k==='labels'?x.matrix.length:n))add('input.'+k,'数量须与矩阵匹配');
    x.matrix.forEach((row,i)=>{if(!Array.isArray(row)||row.length!==n)return add(`input.matrix.${i}`,'每行指标数必须相同');row.forEach((v,j)=>{if(!finite(v))add(`input.matrix.${i}.${j}`,'必须填写有限数值；空白不补零',{objectId:x.objectIds?.[i]||String(i),indicatorId:x.indicators?.[j]?.indicatorId||String(j)});});});
    x.labels?.forEach?.((v,i)=>{if(typeof v!=='string'||!v.trim()||v.length>300)add(`input.labels.${i}`,'对象名称必填，最多300字');});
    if(Array.isArray(x.labels)&&new Set(x.labels.map(v=>typeof v==='string'?v.trim():v)).size!==x.labels.length)add('input.labels','对象名称必须唯一');
    x.directions?.forEach?.((v,j)=>{if(!['benefit','cost'].includes(v))add(`input.directions.${j}`,'请核定越大越优或越小越优');});
    x.indicators?.forEach?.((v,j)=>{
      if(!isObject(v))return add(`input.indicators.${j}`,'指标须为对象');
      for(const k of ['name','unit'])if(typeof v[k]!=='string'||!v[k].trim())add(`input.indicators.${j}.${k}`,'名称与单位必填');
      for(const k of ['indicatorId','definition','frequency','comparableScope','nature'])if(v[k]!==undefined&&(typeof v[k]!=='string'||v[k].length>2000))add(`input.indicators.${j}.${k}`,'须为文本');
    });
    if(x.objectIds!==undefined&&(!Array.isArray(x.objectIds)||x.objectIds.length!==x.matrix.length||new Set(x.objectIds).size!==x.objectIds.length||x.objectIds.some(v=>typeof v!=='string'||!v)))add('input.objectIds','对象ID须唯一且与对象匹配');
    if(x.weightMethod!==undefined&&!['equal','manual','entropy','critic','ahp'].includes(x.weightMethod))add('input.weightMethod','赋权方法无效');
    if(x.weights!==undefined)numbers('weights',n,n);
    if(x.cellEvidence!==undefined){
      if(!Array.isArray(x.cellEvidence)||x.cellEvidence.length!==x.matrix.length*n)add('input.cellEvidence','每个单元格必须有一项来源核定');
      else {const seen=new Set();x.cellEvidence.forEach((e,k)=>{
        if(!isObject(e))return add(`input.cellEvidence.${k}`,'来源须为对象');
        for(const f of ['objectId','indicatorId','period','sourceRef','nature'])if(typeof e[f]!=='string'||!e[f].trim()||e[f].length>4000)add(`input.cellEvidence.${k}.${f}`,'逐项来源、期间及数值性质必填');
        if(!['actual','planned','estimated','expert','demo'].includes(e.nature))add(`input.cellEvidence.${k}.nature`,'数值性质无效');
        if(e.nature==='expert'&&(typeof e.reviewedBy!=='string'||!e.reviewedBy.trim()))add(`input.cellEvidence.${k}.reviewedBy`,'专家评分须注明评分人');
        if(!['verified','pending'].includes(e.reviewStatus))add(`input.cellEvidence.${k}.reviewStatus`,'核定状态无效');
        for(const f of ['quote','page','reviewedBy','reviewedAt'])if(e[f]!==undefined&&typeof e[f]!=='string')add(`input.cellEvidence.${k}.${f}`,'须为文本');
        const i=x.objectIds?.indexOf(e.objectId),j=x.indicators?.findIndex(v=>v?.indicatorId===e.indicatorId),key=e.objectId+'|'+e.indicatorId;
        if(i<0||i===undefined||j<0||j===undefined||seen.has(key))add(`input.cellEvidence.${k}`,'来源必须唯一对应本矩阵中的对象和指标');
        else if(e.value!==x.matrix[i][j])add(`input.cellEvidence.${k}.value`,'来源核定值与矩阵不一致');
        seen.add(key);
      });}
    }
  } else if (['growth','cagr','trend','moving'].includes(method)) {
    if(!Array.isArray(x.rows)||x.rows.length<2||x.rows.length>5000)add('input.rows','需要2—5000期数据');
    else x.rows.forEach((r,i)=>{if(!isObject(r))return add(`input.rows.${i}`,'统计记录须为对象');if(typeof r.period!=='string'||!/^\d{4}(?:-(?:0[1-9]|1[0-2])|-Q[1-4])?$/.test(r.period))add(`input.rows.${i}.period`,'期间须为YYYY、YYYY-MM或YYYY-Qn');if(!finite(r.value))add(`input.rows.${i}.value`,'必须填写有限数值');for(const k of ['sourceUrl','sourceRef'])if(r[k]!==undefined&&typeof r[k]!=='string')add(`input.rows.${i}.${k}`,'来源须为文本');if(r.partial!==undefined&&typeof r.partial!=='boolean')add(`input.rows.${i}.partial`,'须为布尔值');});
  } else if(method==='ahp') { /* judgment validation below */ }
  else if(method==='npv'){numbers('cashflows');if(!finite(x.rate))add('input.rate','折现率须为有限小数');}
  else if(method==='scenario'){if(!finite(x.baseline))add('input.baseline','基线须为有限数值');numbers('shocks',1,30);}
  else if(method==='network-degree'){
    if(!Array.isArray(x.edges)||!x.edges.length||x.edges.length>10000)add('input.edges','需要1—10000条有证据关系');
    else x.edges.forEach((e,i)=>{if(!isObject(e))return add(`input.edges.${i}`,'关系须为对象');for(const k of ['from','to','evidence'])if(typeof e[k]!=='string'||!e[k].trim())add(`input.edges.${i}.${k}`,'实体与明确关系证据必填');if(e.type!==undefined&&typeof e.type!=='string')add(`input.edges.${i}.type`,'须为文本');if(e.from===e.to)add(`input.edges.${i}.to`,'关系两端须为不同实体');});
  } else if(['describe','hhi','gini','pearson','spearman'].includes(method)){numbers('values');if(['pearson','spearman'].includes(method))numbers('other',3);}
  if(x.judgments!==undefined||method==='ahp'||method==='ahp-topsis'||x.weightMethod==='ahp'){
    const a=x.judgments,n=a?.length;
    if(!Array.isArray(a)||n<2||n>10||a.some(r=>!Array.isArray(r)||r.length!==n||r.some(v=>!finite(v)||v<=0)))add('input.judgments','AHP需要2—10阶有限正数判断矩阵');
  }
  if(x.window!==undefined&&(!Number.isInteger(x.window)||x.window<2))add('input.window','平滑窗口须为不小于2的整数');
  if(x.completeUniverse!==undefined&&typeof x.completeUniverse!=='boolean')add('input.completeUniverse','总体完整声明须为布尔值');
  if(x.scan!==undefined&&(!isObject(x.scan)||!Number.isInteger(x.scan.indicatorIndex)||x.scan.indicatorIndex<0||x.scan.indicatorIndex>=(x.indicators?.length||0)||x.scan.type!=='nine-point'))add('input.scan','九点扫描须指定有效指标');
}
