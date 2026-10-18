import {esc} from './state.js';
import {table} from './results.js';

const evidence = (url,n=1) => `<sup><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${n}</a></sup>`;
export function workflowMaterial(c,d,record){
  if(!c?.workflow||!d.presentationVersionId||!record)return '';
  const t=c.tasks.find(x=>x.versionId===record.id),url='api/strategy/studies/'+record.id+'/export?format=json';
  let body='';
  if(d.step===0)body=`<p><b>总研究问题：</b>${esc(c.workflow.decisionQuestion)}</p><p><b>本次可运行子任务：</b>${esc(t?.label||record.method.name)}。${esc(t?.why||'')}</p><p>下方的研究问题、领域、国家、资料日期、功能单位、对象总体、系统边界与币值口径均已预填；数值输入的适用期间与原文发布日期分开声明。</p><p><b>演示顺序：</b>研究问题 → 指标与来源 → 方法与参数 → 结果及敏感性 → 版本差异 → 研究成果管理 → 循证研究问答。当前为保存案例，查看结果无需再次计算。</p>`;
  if(d.step===1)body=`<h3>指标、数据性质与证据底稿</h3><div class="table-wrap strategy-scroll"><table><thead><tr><th>指标/信息</th><th>已填内容</th><th>性质</th><th>核查出处</th></tr></thead><tbody>${c.facts.map(f=>`<tr><td>${esc(f.label)}</td><td>${esc(f.display)}${evidence(c.sources.find(s=>s.number===f.source).url,f.source)}</td><td>${esc(f.nature)}</td><td><button type="button" data-document="${esc(c.sources.find(s=>s.number===f.source).documentId)}">库内原文</button></td></tr>`).join('')}${c.assumptions.map(a=>`<tr><td>${esc(a.label)}</td><td>${esc(a.value)}${evidence(url,4)}</td><td>研究设定</td><td>${esc(a.explanation)}</td></tr>`).join('')}</tbody></table></div><p>${c.kind==='evaluation'?'下方原生矩阵已填好对象、指标、单位、方向和逐格证据；矩阵值均为研究情景，不把背景来源链接冒充数值原表。能力与就绪窗口仅核对情景数值阈值，实际工程许可与安全仍待补。':'现金流由协议上限与自设单位净现金贡献形成条件性输入；初始支出及无收入时段均为明确设定，不用零值代替缺失实绩。下方保留原生输入表、共同来源、参数核定人与可比性声明。'}${evidence(url,4)}</p>`;
  if(d.step===2)body=`<h3>已保存的方法匹配与参数说明</h3><p><b>所选方法：</b>${esc(record.method.name)}。${esc(t?.why||'')}</p><p>本版本保留了人工方法选择记录；数值由存档计算程序生成。${c.kind==='evaluation'?'综合得分为候选方案之间的条件性相对比较，不能替代实际工程资格审查。':'完整源汇最优匹配所需的 GIS/MILP 不在本次计算范围。'}</p><div class="strategy-actions">${c.tasks.map(x=>`<button type="button" data-case-flow-task="${esc(x.key)}">切换预填任务：${esc(x.label)}</button>`).join('')}</div><p>下方参数和依据已填好。展示已保存版本无需再次确认；修改后执行新计算，仍须点击“确认当前方法”并核对输入。</p>`;
  if(d.step===3)body=`<h3>结果检验与研判材料</h3><p>下方展示本任务已经保存的计算结果、输入、来源、方法选择记录及随版本保存的研判说明。${c.kind==='evaluation'?'工程情景更新与等权交叉评价可直接切换核对，权重扰动与九点扫描在相应版本中展示。':'资金成本与收入延后版本可直接切换核对。'}</p><div class="strategy-actions">${c.tasks.map(x=>`<button type="button" data-case-result="${esc(x.key)}">${esc(x.label)}</button>`).join('')}<button type="button" data-go="assets">查看研究成果管理</button><button type="button" data-go="qa">查看案例研究问答</button></div>`;
  return `<section class="strategy-case-step-material" data-case-step-material="${d.step}"><small>已预填的研究展示材料 · ${esc(t?.label||'')}</small>${body}<p class="meta">展示依据为已保存版本。${evidence(url,4)} 事实、情景与计算结果分别标注；当前展示不创建新版本。</p></section>`;
}

export function archivedMethod(record){
  return `<section class="strategy-method-note"><h3>归档的方法选择记录</h3><p>${esc(record.method.name)} · ${record.methodSelection?.mode==='manual'?'人工选择并确认':'按归档记录'} · ${esc(record.methodSelection?.confirmedAt||record.createdAt)}</p><p>${esc(record.researchNotes?.methodRationale||record.method.caution)}</p><p class="meta">当前为已保存案例的预填展示。需要重新计算时，核对下方参数并重新确认当前方法。</p><button type="button" data-confirm-current-method>确认当前方法，用于新版本计算</button></section>`;
}
