import {esc} from './state.js';
import {input, select, label} from './matrix.js';
import {countrySelection, periodChoices, CUSTOM_TOPIC, isCustomTopic, customTopicError} from './scope-state.js';

const preserveChoice = (choices, value) => value && !choices.some(([v]) => v === value)
  ? [...choices, [value, `原选择：${value}（当前未登记）`]] : choices;
export function countrySummary(d, c) {
  const selected = countrySelection(d.scope.country);
  if (!selected.length) return '全部国家/地区';
  const names = selected.map(code => c.filterOptions.countries.find(v => v.code === code)?.name || code);
  return names.length > 2 ? `${names.slice(0, 2).join('、')} 等 ${names.length} 个` : names.join('、');
}

export function scopeFeedback(d, c) {
  const error = customTopicError(d, c.filterOptions.topics);
  if (error) return error + '，填写完成后匹配数据。';
  return c.assets.series ? `当前范围有 ${c.assets.series} 条可用统计序列、${c.assets.points} 个数据点`
    : isCustomTopic(d, c.filterOptions.topics) ? '当前自定义领域暂无已核定统计序列，可使用人工核定数据开展研究。'
    : '此范围暂无可用统计序列；可扩大期间或调整国家、来源';
}

function topicField(d, topics) {
  const custom = isCustomTopic(d, topics), choice = {...d, scope: {...d.scope, topic: custom ? CUSTOM_TOPIC : d.scope.topic}};
  const selector = select(choice, 'scope.topic', '研究领域', [['', '全部领域'], ...topics.map(v => [v.id, v.name]), [CUSTOM_TOPIC, '自定义']], custom ? 'scope.topicChoice' : 'scope.topic').replace('<select ', '<select data-topic-choice ');
  return `<span class="strategy-control">${selector}${custom ? `<input type="text" data-custom-topic data-field="scope.topic" aria-label="自定义研究领域" aria-describedby="strategy-custom-topic-reason" data-free-input maxlength="120" required value="${esc(d.scope.topic)}" placeholder="请输入研究领域名称（1—120字）"><small id="strategy-custom-topic-reason" class="strategy-input-reason">需要填写的原因：现有领域未覆盖研究对象时，须填写实际领域名称。名称用于本次研究范围；不自动改变平台分类。未匹配到统计序列时，可使用人工核定数据。</small>` : ''}</span>`;
}

export function scopeFields(d, c) {
  const options = c.filterOptions, selected = countrySelection(d.scope.country);
  const countries = [...options.countries, ...selected.filter(code => !options.countries.some(v => v.code === code)).map(code => ({code, name: `原选择：${code}`}))];
  const periods = d.periodPreset === 'legacy' ? [...periodChoices, ['legacy', '保留原研究期间']] : periodChoices;
  return `<div class="strategy-form-row strategy-scope-period">${label('研究期间', select(d, 'periodPreset', '研究期间', periods, 'provenance.period'))}<p class="meta strategy-period-description" data-period-description>${esc(d.period)}${['all', 'legacy', 'custom'].includes(d.periodPreset) ? '' : '（按北京时间选择并固定日期）'}</p></div>
  ${d.periodPreset === 'custom' ? `<div class="strategy-form-row">${label('起始日期', input(d, 'scope.from', '研究起始日期', {type: 'date', field: 'scope.from'}))}${label('截止日期', input(d, 'scope.to', '研究截止日期', {type: 'date', field: 'scope.to'}))}</div>` : ''}
  <div class="strategy-form-row strategy-scope-selectors">
    ${label('研究领域', topicField(d, options.topics))}
    <div class="strategy-field strategy-country-field"><span id="strategy-country-label">国家/地区（可多选）</span><details class="strategy-country-picker" data-country-picker><summary aria-labelledby="strategy-country-label" data-field="scope.country"><span data-country-summary>${esc(countrySummary(d, c))}</span><span aria-hidden="true">⌄</span></summary><div class="strategy-country-menu"><input type="search" data-country-search aria-label="搜索国家或地区" placeholder="搜索国家或地区"><button type="button" data-country-reset>选择全部国家/地区</button><div class="strategy-country-options" role="group" aria-label="选择研究国家或地区">${countries.map(v => `<label data-country-name="${esc(v.name.toLowerCase() + ' ' + v.code.toLowerCase())}"><input type="checkbox" data-country="${esc(v.code)}" ${selected.includes(v.code) ? 'checked' : ''}>${esc(v.name)}</label>`).join('')}</div><p class="meta">不勾选表示全部；多选包含任一所选国家/地区的资料。</p></div></details></div>
    ${label('数据来源', select(d, 'scope.sourceId', '数据来源', preserveChoice([['', '全部数据来源'], ...options.sources.map(v => [v.id, v.name])], d.scope.sourceId), 'scope.sourceId'))}
  </div><div class="strategy-actions"><button type="button" data-action="refresh-scope">刷新此范围数据</button><span class="meta" data-scope-feedback role="status">${esc(scopeFeedback(d, c))}</span></div><p class="meta">按统计期间筛选序列；文章按原文发布日期筛选。数据有发布滞后，近期可能暂无统计记录。</p>`;
}
