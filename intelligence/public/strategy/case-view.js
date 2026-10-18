import {evaluationOverview} from './evaluation-case-view.js';
import {esc} from './state.js';
import {num, table} from './results.js';

const cite = n => `<sup><a href="#case-note-${n}" data-case-note="${n}" aria-label="查看依据 ${n}">${n}</a></sup>`;
const sourceCite = (c, n) => `<sup><a href="${esc(c.sources.find(s => s.number === n).url)}" target="_blank" rel="noopener noreferrer" aria-label="打开原始来源 ${n}">${n}</a></sup>`;
const money = v => new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 2}).format(v / 10000);
const taskButton = (t, label = '查看真实计算结果') => `<button type="button" data-case-result="${esc(t.key)}">${label} →</button>`;

export function caseCards(catalog) {
  return (catalog.caseStudies || []).map(c => `<section class="panel strategy-case-entry"><small>RESEARCH IN PRACTICE / 研究展示案例</small><h2>${esc(c.title)}</h2><p>${esc(c.subtitle)}</p><p class="meta">库内官方证据 · 已保存计算版本 · 事实与情景分列</p><button type="button" class="primary" data-case-open="${esc(c.id)}">从研究问题开始查看预填案例 →</button></section>`).join('');
}

export function caseContext(c) {
  if (!c) return '';
  return `<section class="strategy-case-context"><div><small>当前研究案例</small><b>${esc(c.title)}</b>${c.evidenceStatus&&c.evidenceStatus!=='matched'?'<p role="alert">库内原文已变化或缺失；当前为冻结案例，复用前须重新核对来源。</p>':''}</div><div class="strategy-actions"><button type="button" data-case-workflow>从研究问题开始</button><button type="button" data-go="assets">研究成果</button><button type="button" data-go="qa">案例问答</button><button type="button" data-case-overview>返回案例全景</button><button type="button" data-case-close>退出案例上下文</button></div></section>`;
}

export function caseMethods(c) {
  if (!c) return '';
  const methods = c.tasks.filter((t, i, all) => all.findIndex(x => x.method === t.method) === i);
  return `<section class="panel"><h2>这个研究问题为什么采用这些方法</h2><p class="meta">以下任务已经由现有计算程序运行并保存；方法选择记录属于人工选择，不冒充 AI 推荐。</p><div class="strategy-card-grid">${methods.map(t => `<article class="strategy-card"><h3>${esc(t.record.method.name)}</h3><p>${esc(t.why)}</p>${taskButton(t)}</article>`).join('')}</div><p class="strategy-method-note">${c.kind==='evaluation'?'实际许可、安全、可用运力及真实工程造价仍待核验；综合得分不代替工程适用性审查或净减排计算。':'GIS、MILP、完整技术经济评价与全生命周期净减排清单仍待接入；未用综合评分替代源汇优化。'}</p></section>`;
}

export function caseQuestions(c) {
  if (!c) return '';
  return `<section class="panel strategy-case-questions"><h2>围绕这个案例继续核对证据</h2><p>已整理并保存带来源的案例答复，点击即可在原问答区域展示；答复明确标为案例整理，不冒充 AI 生成。</p>${(c.qaRecords||[]).map(r=>`<button type="button" data-case-answer="${esc(r.id)}">查看已保存答复：${esc(r.question)} →</button>`).join('')}<p class="meta">也可将下列问题填入输入框，继续使用原有问答功能。</p>${c.questions.map((q, i) => `<button type="button" data-case-question="${i}">${esc(q)} →</button>`).join('')}</section>`;
}

export function caseOverview(c) {
  if(c.kind==='evaluation')return evaluationOverview(c);
  const volume = c.tasks.find(t => t.key === 'volume');
  const network = c.tasks.find(t => t.key === 'network');
  const economics = c.tasks.filter(t => t.method === 'npv');
  const maxNPV = Math.max(1, ...economics.map(t => Math.abs(t.record.calculation.result.npv)));
  return `<section class="panel strategy-case-hero"><small>FROM EVIDENCE TO RESEARCH / 研究展示案例</small><h2>${esc(c.title)}</h2><button type="button" class="primary" data-case-workflow>查看已预填的完整研究流程 →</button><button type="button" data-case-close>返回工作台总览</button><p>${esc(c.subtitle)}</p><p class="strategy-method-note">${esc(c.boundary)}</p>${c.evidenceStatus !== 'matched' ? '<p role="alert">库内原文已变化或缺失。以下为发布时冻结案例，复用前请重新核对来源。</p>' : '<p class="meta">案例冻结日期：'+esc(c.asOf)+'；已与当前库内原文指纹核对。原文的未来计划仍按计划呈现。</p>'}<div class="strategy-case-flow">${[['证据','原文与数据性质'],['分析','路线与规模情景'],['检验','资金成本与时序'],['积累','版本、复算与导出']].map(([a,b])=>`<div><strong>${a}</strong><span>${b}</span></div>`).join('')}</div></section>
  <section class="panel"><small>EVIDENCE / 事实底稿</small><h2>先确定什么是已知，什么仍是计划</h2><div class="strategy-case-facts">${c.facts.map(f=>`<article><span>${esc(f.label)}</span><strong>${esc(f.display)}${sourceCite(c,f.source)}</strong><small>${esc(f.nature)}</small></article>`).join('')}</div><p class="meta">封存能力、协议服务上限与实际年封存量分别记录；本案例不推算净减排量，也不把设计能力作为可供新客户使用的剩余能力。</p></section>
  <section class="panel"><small>CONNECTIONS / 从源到汇</small><h2>一条跨境计划路线，一个已披露运行试点</h2><div class="strategy-case-route"><span>Filbornaverket<br><small>瑞典排放源</small></span><i>公路 →</i><span>Halmstad 港<br><small>出口环节</small></span><i>船运 →</i><span>Øygarden<br><small>挪威接收站</small></span><i>管输 →</i><span>海底封存系统</span></div><p>瑞典线路为协议披露的计划链条，附约定条件。${sourceCite(c,1)} Veas 试点以公路接入同一接收环节，已披露首次注入；试点与瑞典协议的实施状态不同。${sourceCite(c,3)}</p>${table(network.record.input.edges.map(e=>({'起点':e.from,'终点':e.to,'关系状态':e.type,'依据':e.evidence}))) }<p class="meta">连接度来自所选证据关系，不能说明现实市场地位、吞吐量或最优路径。${cite(4)}</p>${taskButton(network)}</section>
  <section class="panel"><small>SCENARIOS / 规模兑现</small><h2>如果合同上限只兑现一部分</h2><p>参考值采用协议年服务上限，比例为研究设定；没有给情景赋予发生概率。${sourceCite(c,1)}${cite(5)}</p><div class="strategy-case-bars">${volume.record.calculation.result.scenarios.map(s=>`<div><span>兑现 ${num((1+s.shock)*100)}%</span><div class="strategy-case-track"><i style="width:${(1+s.shock)*100}%"></i></div><strong>${new Intl.NumberFormat('zh-CN').format(s.value)} 吨 / 年${cite(5)}</strong></div>`).join('')}</div>${taskButton(volume)}<button type="button" data-case-resume="volume">预填输入，核定后复算 →</button></section>
  <section class="panel"><small>INVESTMENT / 条件性经济检验</small><h2>同一项附属环节假设，资金成本与投运时序会怎样改变结果</h2><p>以下为独立的附属接收环节投资情景，全部财务参数为研究设定；不代表北方之光或瑞典客户的实际投资、报价、利润或项目估值。${cite(6)}</p><div class="strategy-case-npv">${economics.map((t,i)=>{const v=t.record.calculation.result.npv;return `<article><span>${esc(t.label)}</span><strong class="${v<0?'negative':''}">${v<0?'−':'+'}${money(Math.abs(v))}<small> 万欧元${cite(6+i)}</small></strong><div class="strategy-case-track"><i class="${v<0?'negative':''}" style="width:${Math.abs(v)/maxNPV*100}%"></i></div><p class="meta">${esc(t.why)}</p>${taskButton(t)}<button type="button" data-case-resume="${esc(t.key)}">恢复输入 / 核定复算</button></article>`;}).join('')}</div><p class="strategy-method-note">比较只说明输入条件改变后的 NPV 差异。收入晚两期的情景仍在起点支出前期投入；没有求解最优投资年份，也不推断任何真实项目是否应投资。${cite(6)}${cite(8)}</p></section>
  <section class="panel"><h2>公开事实之外，哪些参数是研究设定</h2>${table(c.assumptions.map(a=>({'参数':a.label,'设定':a.value,'性质与边界':a.explanation})))}<p class="meta">以上数字均为本案例自设的条件检验参数，未标为外部统计或工程估算。数值计算由已保存版本支持。${cite(5)}${cite(6)}${cite(7)}${cite(8)}</p></section>
  <section class="panel"><h2>事件与目标日期分开看</h2><div class="strategy-case-timeline">${c.timeline.map(t=>`<article><b>${esc(t.date)}${sourceCite(c,t.source)}</b><div><h3>${esc(t.title)}</h3><p>${esc(t.text)}</p></div></article>`).join('')}</div></section>
  ${caseMethods(c)}${caseQuestions(c)}
  <section class="panel"><h2>可复核的来源与计算脚注</h2><ol class="strategy-case-notes">${c.sources.map(s=>`<li id="case-note-${s.number}"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a> · ${esc(s.publishedAt)} · ${s.verification==='matched'?'库内原文一致':'待重新核对'} <button type="button" data-document="${esc(s.documentId)}">查看库内原文</button></li>`).join('')}${c.tasks.map((t,i)=>`<li id="case-note-${i+4}"><a href="api/strategy/studies/${esc(t.versionId)}/export?format=json" target="_blank" rel="noopener noreferrer">${esc(t.label)}：冻结输入、计算结果与版本依据</a>。${esc(t.kind==='scenario'?'包含明确标注的研究情景假设。':'来源关系按规划与已披露运行区分。')}</li>`).join('')}</ol><div class="strategy-actions"><button type="button" data-go="assets">进入研究成果管理 →</button><button type="button" data-go="recommend">回到智能选题推荐 →</button></div></section>`;
}
