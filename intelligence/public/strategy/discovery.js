import {esc} from './state.js';

export const DISCOVERY_PAGE_SIZE = 6;
const statusNames = {ready: '当前可计算', 'needs-data': '需要补数据', 'needs-review': '待核定数据', 'engine-pending': '方法待接入'};
const methodNames = {growth: '变化与基期比较', trend: '已观测趋势研判', 'entropy-topsis': '建立综合评价方案', milp: '建立容量配置方案'};
const defaults = () => ({direction: '', industry: '', task: '', status: '', q: '', page: 1});

export function discoveryState(draft) {
  const state = draft.discovery ||= {};
  if (!['data', 'themes'].includes(state.section)) state.section = 'data';
  for (const key of ['data', 'themes']) state[key] = {...defaults(), ...state[key]};
  return state;
}

// Filter methods before grouping: a matching card never exposes an action that
// contradicts the task/status filters. Only one page of cards is rendered.
export function discoveryPage(catalog, state) {
  const themes = state.section === 'themes', filters = state[state.section];
  const registry = new Map(catalog.recommendations.map(r => [r.id, r]));
  const entries = themes ? catalog.templates : catalog.discovery.opportunities.map(g => ({...g, actions: g.actions.map(id => registry.get(id)).filter(Boolean)}));
  const query = String(filters.q || '').trim().toLocaleLowerCase();
  const facetMatch = x => (!filters.task || (x.classification.taskTypes || []).includes(filters.task)) && (!filters.status || (themes ? x.dataStatus : x.status) === filters.status);
  const candidates = entries.map(x => themes ? x : {...x, actions: x.actions.filter(facetMatch)}).filter(x => {
    if (themes ? !facetMatch(x) : !x.actions.length) return false;
    const ids = x.classification.industryIds;
    if (filters.industry && (filters.industry === 'unclassified' ? ids.length : !ids.includes(filters.industry))) return false;
    const text = themes ? [x.title, x.question, x.indicators, x.tracking?.object, x.dataRequirements] : [x.title, x.context?.sourceName, x.context?.country, ...x.actions.map(a => [a.title, a.reason, a.gaps].join(' '))];
    return !query || text.join(' ').toLocaleLowerCase().includes(query);
  });
  const directions = catalog.discovery.directions.map(d => ({...d, count: candidates.filter(x => x.classification.directionId === d.id).length}));
  const filtered = candidates.filter(x => !filters.direction || x.classification.directionId === filters.direction);
  const pages = Math.max(1, Math.ceil(filtered.length / DISCOVERY_PAGE_SIZE));
  const page = Math.max(1, Math.min(pages, Math.floor(Number(filters.page) || 1)));
  return {themes, filters, directions, total: filtered.length, available: entries.length, page, pages, items: filtered.slice((page - 1) * DISCOVERY_PAGE_SIZE, page * DISCOVERY_PAGE_SIZE), entries};
}

const options = (items, selected, all, missingName = selected) => {if (selected && !items.some(([id]) => id === selected)) items = [...items, [selected, missingName]]; return `<option value="">${esc(all)}</option>${items.map(([id, name]) => `<option value="${esc(id)}"${id === selected ? ' selected' : ''}>${esc(name)}</option>`).join('')}`;};
const badge = (status) => `<span class="strategy-tag ${status === 'ready' ? 'ready' : ''}">${esc(statusNames[status] || status)}</span>`;
const industryNames = (item, catalog) => item.classification.industryIds.map(id => catalog.discovery.industries.find(i => i.id === id)?.name || id).join(' / ') || '待核定领域';

function opportunityCard(item, catalog) {
  const first = item.actions[0], coverage = item.coverage;
  return `<article class="strategy-card strategy-discovery-card" data-opportunity="${esc(item.id)}">
    <div class="strategy-discovery-card-meta"><small>${esc(industryNames(item, catalog))}</small>${badge(first.status)}</div>
    <h3>${esc(item.title)}</h3>
    ${item.context ? `<p class="meta">${esc([item.context.sourceName, item.context.country, item.context.frequency].filter(Boolean).join(' · '))}</p>` : ''}
    ${coverage ? `<p>${esc(coverage.from)}—${esc(coverage.to)} · ${coverage.n}期 · ${esc(coverage.unit)}</p>` : `<p>${esc(first.reason)}</p>`}
    <div class="strategy-discovery-methods">${item.actions.map(r => `<button type="button" data-recommend="${esc(r.id)}">${esc(methodNames[r.method] || r.title)} →</button>`).join('')}</div>
    <p class="meta">${first.status === 'ready' ? '进入任务后仍须核定研究范围、来源与方法前提。' : esc(first.gaps)}</p>
    <details><summary>推荐与分类依据</summary><p class="meta">${esc(item.classification.reason)}</p>${item.actions.map(r => `<p class="meta"><b>${esc(methodNames[r.method] || r.method)}</b>：${esc(r.reason)} ${esc(r.gaps)} 引擎：${r.engineStatus === 'accepted' ? '已接入' : '待接入'}。</p>`).join('')}<small class="meta">规则 ${esc(item.classification.version)} · ${esc(item.classification.ruleId)}</small></details>
  </article>`;
}

function themeCard(t, catalog) {
  return `<article class="strategy-card strategy-discovery-card" data-theme="${esc(t.id)}">
    <div class="strategy-discovery-card-meta"><small>${esc(industryNames(t, catalog))}</small>${badge(t.dataStatus)}</div>
    <h3>${esc(t.title)}</h3><p>${esc(t.question)}</p>
    <p class="meta">跟踪对象：${esc(t.tracking?.object || t.indicators)}</p>
    <p class="meta">更新依据：${esc(t.tracking?.refreshTrigger || '新增相关数据后人工审核')}</p>
    <button type="button" data-template="${esc(t.id)}">建立研究方案 →</button>
    <details><summary>数据要求与跟踪边界</summary><p>${esc(t.liveReadiness)}</p><p class="meta">所需指标：${esc(t.indicators)}</p><p class="meta">方法：${esc(t.methods)}</p><p class="meta">边界：${esc(t.guardrail)}</p><p class="meta">${esc(t.tracking?.comparisonBasis || '')}</p><p class="meta">${esc(t.updatePolicy)}</p><p class="meta">${esc(t.classification.reason)}</p><small class="meta">规则 ${esc(t.classification.version)}</small></details>
  </article>`;
}

export function discoveryView(catalog, state) {
  const view = discoveryPage(catalog, state), {filters, themes, items, total, page, pages} = view;
  filters.page = page;
  const selected = catalog.discovery.directions.find(d => d.id === filters.direction);
  const tasks = [...new Set(view.entries.flatMap(x => x.classification.taskTypes))].filter(Boolean);
  const statuses = [...new Set(view.entries.flatMap(x => themes ? [x.dataStatus] : x.actions.map(a => a.status)))];
  return `<section class="panel strategy-discovery">
    <div class="strategy-discovery-switch" role="group" aria-label="选题来源">
      <button type="button" data-discovery-section="data" aria-pressed="${!themes}">数据驱动选题 <span>${catalog.discovery.counts.opportunities}</span></button>
      <button type="button" data-discovery-section="themes" aria-pressed="${themes}">长期跟踪研究主题库 <span>${catalog.discovery.counts.themes}</span></button>
    </div>
    <div class="strategy-section-title"><div><h2>${themes ? '长期跟踪研究主题库' : '让已有数据提出可检验的问题'}</h2><p class="meta">${themes ? '围绕同一主题，随新数据积累开展可比的量化分析；核定新数据后另存研究版本。目前采用人工审核更新，尚未启用自动监测、提醒或后台复算。' : '先按研究方向归组，再筛选领域、任务与可用状态。同一数据的不同方法合并展示，进入后仍须核定范围。'}</p></div><button type="button" data-action="refresh-catalog">重新核验范围</button></div>
    <nav class="strategy-discovery-directions" aria-label="研究方向"><button type="button" data-discovery-direction="" aria-pressed="${!filters.direction}"><b>全部方向</b><span>${view.directions.reduce((n, d) => n + d.count, 0)}</span></button>${view.directions.filter(d => d.count || d.id === filters.direction).map(d => `<button type="button" data-discovery-direction="${esc(d.id)}" aria-pressed="${filters.direction === d.id}"><b>${esc(d.name)}</b><span>${d.count}</span></button>`).join('')}</nav>
    <div class="strategy-discovery-filters">
      <label>研究领域<select data-discovery-filter="industry">${options(catalog.discovery.industries.map(i => [i.id, i.name]), filters.industry, '全部领域（含交叉主题）')}</select></label>
      <label>研究任务<select data-discovery-filter="task">${options(tasks.map(id => [id, catalog.tasks[id] || id]), filters.task, '全部任务', catalog.tasks[filters.task] || filters.task)}</select></label>
      <label>可用状态<select data-discovery-filter="status">${options(statuses.map(id => [id, statusNames[id] || id]), filters.status, '全部状态', statusNames[filters.status] || filters.status)}</select></label>
      <label>搜索${themes ? '主题' : '选题或来源'}<input type="search" data-discovery-search value="${esc(filters.q)}" placeholder="${themes ? '主题、指标、跟踪对象' : '数据名称、来源、国家代码'}"></label>
    </div>
    <div class="strategy-section-title strategy-discovery-results"><div><h3>${esc(selected?.name || '全部研究方向')}</h3><p class="meta">${esc(selected?.description || '选择方向缩小范围；领域可交叉筛选。')} ${themes ? '主题为研究设计，不能直接视为已完成的监测或计算。' : '按合并后的选题计数，方法入口保留。'}</p></div><p role="status" data-discovery-count>共 ${total} ${themes ? '个研究主题' : '组选题'} · 第 ${page} / ${pages} 页</p></div>
    ${items.length ? `<div class="strategy-discovery-grid">${items.map(x => themes ? themeCard(x, catalog) : opportunityCard(x, catalog)).join('')}</div>` : '<div class="strategy-discovery-empty"><h3>当前条件下没有匹配的选题</h3><p>可清除筛选条件，或调整量化研究中的数据范围后重新核验。</p></div>'}
    <div class="strategy-discovery-pagination"><button type="button" data-discovery-page="${page - 1}"${page <= 1 ? ' disabled' : ''}>上一页</button><span>${total ? (page - 1) * DISCOVERY_PAGE_SIZE + 1 : 0}–${Math.min(page * DISCOVERY_PAGE_SIZE, total)} / ${total}</span><button type="button" data-discovery-page="${page + 1}"${page >= pages ? ' disabled' : ''}>下一页</button><button type="button" data-discovery-reset>清除筛选</button></div>
    <details class="strategy-discovery-policy"><summary>分类与更新规则</summary><p class="meta">${esc(catalog.discovery.policy)}</p><p class="meta">新数据沿用已发布的领域分类；主题库按登记的研究方向归组。缺少可靠分类依据的条目进入“待核定分类”。${themes ? '新增主题后数量和分类目录自动更新，无固定模板数量。' : '排序依据数据前提；分类与推荐不证明因果，也不替代专业核定。'}</p><small class="meta">${esc(catalog.discovery.version)}</small></details>
  </section>`;
}
