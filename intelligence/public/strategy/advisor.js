import {esc, requestFrom, params} from './state.js';

export function advicePayload(d) {
  const r=requestFrom(d);
  for(const k of ['methodSelection','methodSelectionRequired','requestId','parentId','studyId','revisionReason','confirmed']) delete r[k];
  return r;
}
export const adviceKey=d=>{const r=advicePayload(d);delete r.review;return JSON.stringify(r);};
const structureNames={series:'同口径时间序列',matrix:'对象×指标矩阵',paired:'配对观测',cashflows:'分期现金流',network:'有证据的关系网络',panel:'对象×时期面板',spatial:'空间图层与对象',hourly:'同期逐时资源与负荷',other:'待核定'};
const statusNames={'needs-confirmation':'具备基础输入，待确认','needs-data':'需要补齐数据','engine-pending':'计算引擎待接入','not-applicable':'当前不适用'};
const list=(items,empty='暂无')=>items?.length?`<ul>${items.map(v=>`<li>${esc(v)}</li>`).join('')}</ul>`:`<p class="meta">${esc(empty)}</p>`;
export function prepareAdviceChoice(d, candidate, datasetId) {
  const next=structuredClone(d), methodChanged=next.method!==candidate.methodId;
  next.method=candidate.methodId;next.taskType=candidate.taskType;next.datasetId=datasetId || '';
  if(methodChanged){next.parentId=null;next.studyId=null;next.resultId=null;}
  next.confirmed=false;next.requestId=null;next.requestSignature='';next.methodSelectionRequired=true;
  delete next.methodSelection;
  next.adoptedMethodId=candidate.methodId;
  next.gaps=[...candidate.requiredData,...candidate.gaps].join('；');
  params(next);
  return next;
}

export function advisorView(d,c,{busy=false,error=''}={}) {
  const advice=d.methodAdvice?.result, stale=!!advice&&d.methodAdvice.key!==adviceKey(d);
  const view=d.methodView || (d.title.trim()?'current':'all'), q=(d.methodSearch || '').trim().toLowerCase();
  const candidates=(advice?.candidates || []).filter(x=>{const m=c.methods.find(m=>m.id===x.methodId);return view!=='current'||(!d.methodFamily||m?.family===d.methodFamily)&&(!q||[x.name,x.reason,m?.purpose,m?.input,x.methodId].join(' ').toLowerCase().includes(q));});
  const selection=d.methodSelection;
  return `<div class="strategy-advisor-content"><div class="strategy-section-title"><div><small>QUESTION → DATA → METHOD</small><h2>围绕当前任务推荐方法</h2></div>${d.title.trim()?`<button type="button" data-advisor-refresh ${busy?'disabled':''}>${busy?'正在匹配…':'重新分析当前任务'}</button>`:''}</div>
    ${d.title.trim()?`<p class="strategy-advisor-question">${esc(d.title)}</p><p class="meta">当前任务：${esc(c.tasks[d.taskType] || '待确认')} · ${esc(d.scope.topic || '全部研究领域')} · 当前范围 ${c.assets.series} 条统计序列。推荐不会自动更改任务或执行计算。</p>`:'<p>先填写你想研究的问题。系统将结合任务要素、研究边界和已有数据推荐方法。</p><button type="button" data-advisor-setup>填写研究问题 →</button>'}
    ${busy?'<p role="status" class="strategy-method-note">AI 正在理解问题并匹配方法；随后由后台核对真实数据和引擎状态。请稍候…</p>':''}
    ${error?`<p role="alert" class="strategy-warning">${esc(error)} 草稿保留，可重新分析或查看全部方法。</p>`:''}
    ${selection?`<p class="strategy-method-note" data-method-selection-status>已确认：${esc(c.methods.find(m=>m.id===selection.methodId)?.name || selection.methodId)}（${selection.mode==='ai-assisted'?'采用AI建议':selection.mode==='rules-assisted'?'采用规则建议':'手动选择'}）。确认方法不会执行计算；完成参数与核定后，在最后一步计算并保存。</p>`:''}
    ${selection&&d.methodSelectionReadiness?.gaps?.length?`<div class="strategy-warning"><b>当前输入仍有缺口：</b>${list(d.methodSelectionReadiness.gaps)}</div>`:''}
    ${stale?'<p class="strategy-warning" data-advisor-stale>问题、范围或输入已调整，以下是上次匹配结果。请重新分析，或在完成输入后重新确认当前方法。</p>':''}
    ${advice?`${advice.dataSummary?.summaryLimited?'<p class="meta">范围内序列较多，本次优先提供与问题和当前选择相关的100条摘要；可缩小研究范围进一步匹配。</p>':''}${advice.notice?`<p class="strategy-warning" data-advisor-notice>${esc(advice.notice)}</p>`:''}<div class="strategy-section-title"><h3>${advice.mode==='ai'?'AI对研究问题的理解':'规则匹配结果'}</h3><span class="strategy-tag">${advice.mode==='ai'?'AI理解 + 后台条件核验':'规则匹配，未进行AI理解'}</span></div><p>${esc(advice.summary)}</p><dl class="strategy-summary strategy-advisor-elements"><dt>研究目标</dt><dd>${esc(advice.elements.goal || '待确认')}</dd><dt>研究对象</dt><dd>${esc(advice.elements.objects.join('、') || '待明确')}</dd><dt>关键变量</dt><dd>${esc(advice.elements.variables.join('、') || '待明确')}</dd><dt>时间与结构</dt><dd>${esc(advice.elements.period || '待明确')} · ${esc(structureNames[advice.elements.structure] || advice.elements.structure || '待核定')}</dd></dl>${advice.clarifications.length?`<details><summary>需要进一步明确的研究要素（${advice.clarifications.length}）</summary>${list(advice.clarifications)}<button type="button" data-advisor-setup>完善研究问题与边界 →</button></details>`:''}
      <div class="strategy-advisor-grid">${candidates.map(x=>{
        const selected=Object.hasOwn(d.advisorDatasets || {},x.methodId)?d.advisorDatasets[x.methodId]:x.suggestedDatasetId || '';
        const r=selected?x.seriesReadiness.find(s=>s.id===selected) || x:x;
        return `<article class="strategy-card strategy-advice-card" data-advice-method="${esc(x.methodId)}"><div class="strategy-section-title"><h3>${esc(x.name)}</h3><span class="strategy-tag ${r.canRunAfterReview?'ready':''}">${esc(statusNames[r.status] || r.status)}</span></div><p><b>建议任务：</b>${esc(x.taskName)}${x.taskType!==d.taskType?'（与当前选择不同，采用前请核对）':''}</p><p><b>推荐理由：</b>${esc(x.reason)}</p><p class="meta">引擎：${r.engineStatus==='accepted'?'已接入':'未接入'} · 输入：${r.dataStatus==='ready'?'具备基础条件，仍需核定':r.dataStatus==='not-applicable'?'不适用':'待补齐'}</p>
          ${x.series.length?`<label class="strategy-field">适用的已有统计序列<select data-advisor-dataset="${esc(x.methodId)}"><option value="">请选择一条序列，或先完善人工数据</option>${x.series.map(s=>`<option value="${esc(s.id)}"${s.id===selected?' selected':''}>${esc(s.name)} · ${s.count}期 · ${esc(s.unit)} · ${esc(s.country)}</option>`).join('')}</select></label>`:''}
          <details${r.gaps.length?' open':''}><summary>数据缺口与专属核验</summary>${list(r.gaps,'未发现基础输入缺口；尚未执行计算，仍须核定来源与专属诊断。')}<p class="meta">所需数据：${esc(x.requiredData.join('；') || '见方法输入要求')}</p>${list(r.checks)}<p class="meta">${esc(x.diagnostics)}</p></details>
          ${(d.parentId||d.resultId)&&x.methodId!==d.method?'<p class="meta">更换方法将建立独立研究，原有研究版本保留。</p>':''}<button type="button" data-adopt-advice="${esc(x.methodId)}" ${busy||stale?'disabled':''}>${r.engineStatus==='planned'?'确认方法并建立研究方案':r.dataStatus==='ready'?'确认采用此方法':'确认方法并完善数据'} →</button>
        </article>`;
      }).join('')}</div>${!candidates.length?'<p class="empty">当前筛选下没有候选方法，可清除搜索条件或查看全部方法。</p>':''}<p class="meta">状态由后台根据实际输入和引擎登记核验；AI没有计算结果，也不能补造数据。${advice.mode==='ai'?'本次仅调用模型理解与匹配，未运行研究计算。':''}</p>`:''}
    ${d.title.trim()?`<div class="strategy-actions"><button type="button" data-confirm-current-method ${busy?'disabled':''}>${selection?'重新确认当前方法与输入':'确认当前选择的方法与输入'}</button><button type="button" data-advisor-data>完善数据与来源 →</button>${c.methods.find(m=>m.id===d.method)?.status!=='ready'?'<button type="button" data-action="export-gaps">导出研究方案与补数清单</button>':''}</div><p class="meta">可明确手动选择方法；确认只记录研究设计，最终计算仍需通过数据、硬约束和方法前提核验。</p>`:''}</div>`;
}
