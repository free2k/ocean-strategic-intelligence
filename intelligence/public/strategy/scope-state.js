export const periodChoices = [
  ['all', '全部已有历史数据'], ['1m', '最近 1 个月'], ['3m', '最近 3 个月'],
  ['6m', '最近半年'], ['12m', '最近一年'], ['custom', '自定义日期范围'],
];
export const countrySelection = value => [...new Set(String(value || '').split(',').map(v => v.trim().toUpperCase()).filter(Boolean))].sort();

export const CUSTOM_TOPIC = '__custom__';
export const isCustomTopic = (draft, topics) => draft.choiceModes?.['scope.topic'] === 'custom'
  || !!draft.scope.topic && !topics.some(t => t.id === draft.scope.topic);
export function changeTopicChoice(draft, value, topics) {
  if (isCustomTopic(draft, topics)) draft.customTopic = draft.scope.topic;
  draft.choiceModes ||= {};
  draft.choiceModes['scope.topic'] = value === CUSTOM_TOPIC ? 'custom' : 'preset';
  draft.scope.topic = value === CUSTOM_TOPIC ? draft.customTopic || '' : value;
}
export function customTopicError(draft, topics) {
  if (!isCustomTopic(draft, topics)) return '';
  if (!draft.scope.topic.trim()) return '请填写自定义研究领域名称';
  if (draft.scope.topic.length > 120) return '自定义研究领域名称不能超过120字';
  return '';
}

export function recentRange(preset, now = new Date()) {
  const months = {'1m': 1, '3m': 3, '6m': 6, '12m': 12}[preset];
  if (!months) return {from: '', to: ''};
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(p => [p.type, p.value]));
  const year = Number(parts.year), month = Number(parts.month), day = Number(parts.day);
  const start = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(day, lastDay));
  return {from: start.toISOString().slice(0, 10), to: `${parts.year}-${parts.month}-${parts.day}`};
}

export function updatePeriod(draft, preset, now = new Date()) {
  draft.periodPreset = preset;
  if (preset === 'legacy') return;
  if (preset !== 'custom') Object.assign(draft.scope, recentRange(preset, now));
  draft.period = preset === 'all' ? '全部已有历史数据'
    : `${draft.scope.from || '不限起始日期'} 至 ${draft.scope.to || '不限截止日期'}`;
}

export function hydrateScope(draft) {
  draft.scope = {topic: '', country: '', sourceId: '', from: '', to: '', ...draft.scope};
  draft.scope.country = countrySelection(draft.scope.country).join(',');
  // Old drafts and restored studies keep their exact period. Never advance a saved
  // rolling range to today's dates merely because the page has been reopened.
  if (!draft.periodPreset) {
    draft.periodPreset = draft.period ? 'legacy' : draft.scope.from || draft.scope.to ? 'custom' : 'all';
    if (!draft.period) updatePeriod(draft, draft.periodPreset);
  }
  return draft;
}
