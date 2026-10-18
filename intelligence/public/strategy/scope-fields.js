import {esc} from './state.js';
import {input, select, label} from './matrix.js';
import {countrySelection, periodChoices} from './scope-state.js';

const preserveChoice = (choices, value) => value && !choices.some(([v]) => v === value)
  ? [...choices, [value, `原选择：${value}（当前未登记）`]] : choices;
export function countrySummary(d, c) {
  const selected = countrySelection(d.scope.country);
  if (!selected.length) return '全部国家/地区';
  const names = selected.map(code => c.filterOptions.countries.find(v => v.code === code)?.name || code);
  return names.length > 2 ? `${names.slice(0, 2).join('、')} 等 ${names.length} 个` : names.join('、');
}

export function scopeFields(d, c) {
  const options = c.filterOptions, selected = countrySelection(d.scope.country);
  const countries = [...options.countries, ...selected.filter(code => !options.countries.some(v => v.code === code)).map(code => ({code, name: `原选择：${code}`}))];
  const periods = d.periodPreset === 'legacy' ? [...periodChoices, ['legacy', '保留原研究期间']] : periodChoices;
  return `<div class="strategy-form-row strategy-scope-period">${label('研究期间', select(d, 'periodPreset', '研究期间', periods, 'provenance.period'))}<p class="meta strategy-period-description" data-period-description>${esc(d.period)}${['all', 'legacy', 'custom'].includes(d.periodPreset) ? '' : '（按北京时间选择并固定日期）'}</p></div>
  ${d.periodPreset === 'custom' ? `<div class="strategy-form-row">${label('起始日期', input(d, 'scope.from', '研究起始日期', {type: 'date', field: 'scope.from'}))}${label('截止日期', input(d, 'scope.to', '研究截止日期', {type: 'date', field: 'scope.to'}))}</div>` : ''}
  <div class="strategy-form-row strategy-scope-selectors">
    ${label('研究领域', select(d, 'scope.topic', '研究领域', preserveChoice([['', '全部领域'], ...options.topics.map(v => [v.id, v.name])], d.scope.topic), 'scope.topic'))}
    <div class="strategy-field strategy-country-field"><span id="strategy-country-label">国家/地区（可多选）</span><details class="strategy-country-picker" data-country-picker><summary aria-labelledby="strategy-country-label" data-field="scope.country"><span data-country-summary>${esc(countrySummary(d, c))}</span><span aria-hidden="true">⌄</span></summary><div class="strategy-country-menu"><input type="search" data-country-search aria-label="搜索国家或地区" placeholder="搜索国家或地区"><button type="button" data-country-reset>选择全部国家/地区</button><div class="strategy-country-options" role="group" aria-label="选择研究国家或地区">${countries.map(v => `<label data-country-name="${esc(v.name.toLowerCase() + ' ' + v.code.toLowerCase())}"><input type="checkbox" data-country="${esc(v.code)}" ${selected.includes(v.code) ? 'checked' : ''}>${esc(v.name)}</label>`).join('')}</div><p class="meta">不勾选表示全部；多选包含任一所选国家/地区的资料。</p></div></details></div>
    ${label('数据来源', select(d, 'scope.sourceId', '数据来源', preserveChoice([['', '全部数据来源'], ...options.sources.map(v => [v.id, v.name])], d.scope.sourceId), 'scope.sourceId'))}
  </div><div class="strategy-actions"><button type="button" data-action="refresh-scope">刷新此范围数据</button><span class="meta" data-scope-feedback role="status">当前范围有 ${c.assets.series} 条可用统计序列、${c.assets.points} 个数据点</span></div><p class="meta">按统计期间筛选序列；文章按原文发布日期筛选。数据有发布滞后，近期可能暂无统计记录。</p>`;
}
