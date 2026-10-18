import {multiSelect} from '../multi-select.js';
import {esc, getPath, setPath, params} from './state.js';

const catalogs = new WeakMap();
export const configureChoices = (draft, catalog) => catalogs.set(draft, catalog);
const catalogFor = d => catalogs.get(d) || {};
const pairs = values => values.map(v => [v, v]);
const unique = values => [...new Set(values.filter(v => v !== '' && v != null))];
const years = Array.from({length: 201}, (_, i) => String(1900 + i));
const commonUnits = ['各指标单位见表头', '%', 'MW', 'MWh', 'kWh', '吨', '万吨', '吨/年', '桶/日', '千桶/日', '桶油当量/日', '标准立方米', '百万标准立方米', '十亿标准立方米', 'kg氢', 'kg氢/年', 'kWh/kg氢', '元/kg氢', '美元/kg氢', '元/MWh', '美元/MWh', '人民币元', '人民币万元', '美元', '万美元', '欧元', 'tCO₂e', 'tCO₂e/年', '元/tCO₂e', '份', '台/套', '级（须有评分定义）', '分（须有评分手册）'];
const functionalUnits = ['保留原统计序列的单位与口径', '每个项目', '每台/套装备', '每MWh净发电量', '每kg出厂氢', '每kg交付氢', '每吨CO₂封存量', '每吨CO₂e净减排量', '每桶油当量', '每标准立方米天然气', '每个统计年度'];
const boundaries = ['以所选原始统计表的范围为边界', '仅比较本次列出的对象和指标', '生产端（不含储运和交付）', '交付端（含储运和交付）', '项目建设阶段', '项目运营阶段', '项目退役阶段', '全生命周期（须具备各阶段完整数据）'];
const populations = ['所选统计序列覆盖的对象', '本次评价矩阵列出的全部对象', '当前筛选范围内已纳入的对象', '所选国家/地区内已纳入的项目', '所选技术路线的可比项目'];
const comparableScopes = ['同一统计期、单位和数值性质下的对象', '同一国家/地区与原表统计范围', '同一技术类型、开发状态和系统边界', '同币种、币值基年与税费口径', '按本研究已声明的对象总体与系统边界'];
const freeReasons = {
  'configuration.functionalUnit': '功能单位决定比较的基准。特殊产品、交付位置或计量单位无法穷举，须明确实际定义。',
  'configuration.population': '新增项目或技术路线可能尚未入库，须明确本次实际包含哪些对象，不能用预设名称冒充。',
  'configuration.systemBoundary': '研究可能组合不同环节，须说明实际包含和排除的阶段，避免把不同边界的数据直接比较。',
  'configuration.baseYear': '原表可能采用清单外的币值基年，须保留原始年份，不能替换成相近年份。',
  'configuration.currencyBasis': '特殊币种、税费和名义/实际口径必须与原资料一致，系统不能替你假定。',
  'provenance.description': '自有原表或尚未入库的资料没有可选记录，须填写可定位的文件、原表及核定依据。',
  'provenance.unit': '特殊工程单位或混合口径不能被通用单位替代，须写明原表定义。',
  'provenance.author': '系统没有研究团队人员名册。须填写实际核定人或专家姓名，不能预设虚构身份；本草稿已填写的姓名可复用。',
  'provenance.urls': '尚未入库的原始资料没有已登记链接，须提供真实地址；多个地址每行一个。',
  'provenance.reason': '专家判断、折现率和情景假设来自具体报告或人员，不能由通用选项证明。请说明实际依据、确认人及采用规则。',
  'revisionReason': '必须说明这次具体改了什么、依据哪项新资料；通用原因不能替代实际修订记录。',
};

function history(d, category) {return d.choiceHistory?.[category] || [];}
function category(path) {
  if (path === 'provenance.author' || /\.reviewedBy$/.test(path)) return 'reviewers';
  if (path === 'provenance.description' || /\.sourceRef$/.test(path)) return 'references';
  return path;
}
export function rememberCustom(d, path) {
  if (!choiceSpec(d, path)) return;
  const value = getPath(d, path);
  if (typeof value !== 'string' || !value.trim()) return;
  const key = category(path);
  d.choiceHistory ||= {};
  d.choiceHistory[key] = unique([value, ...history(d, key)]).slice(0, 100);
}

export function choiceSpec(d, path) {
  const c = catalogFor(d), options = c.inputOptions || {}, references = options.references || [];
  const objects = () => (options.objects || []).map(o => [o.name, `${o.name} · ${o.type}`]);
  const units = () => pairs(unique([...commonUnits, ...(options.units || [])]));
  const sourceChoices = () => references.map(r => [`${r.title}；${r.url}`, `${r.title} · ${r.kind}`]);
  const priorSources = () => history(d, 'references').map(v => [v, `本草稿已填写：${v}`]);
  const reviewers = () => unique([...history(d, 'reviewers'), d.provenance.author, ...d.evidence.flat().map(e => e.reviewedBy)]).filter(Boolean);
  const result = (choices, reason, extra = {}) => ({choices, reason, ...extra});
  if (path === 'configuration.functionalUnit') return result(pairs(functionalUnits), freeReasons[path]);
  if (path === 'configuration.population') return result(pairs(populations), freeReasons[path]);
  if (path === 'configuration.systemBoundary') return result(pairs(boundaries), freeReasons[path]);
  if (path === 'configuration.baseYear') return result(pairs(years), freeReasons[path], {search:false});
  if (path === 'configuration.currencyBasis') return result(pairs(['不涉及货币量', ...['人民币', '美元', '欧元', '英镑', '挪威克朗'].flatMap(v => [`${v}；原表名义币值`, `${v}；按所选基年不变价`])]), freeReasons[path], {note: '这里只声明币值口径；选择币种不会自动换汇、调整通胀或改变原始数值。'});
  if (path === 'provenance.description') return result([...sourceChoices(), ...priorSources()], freeReasons[path], {note: '选择已入库原文或原表可带入出处；仍须核对它是否支持当前数值。'});
  if (path === 'provenance.urls') return result(references.map(r => [r.url, r.title]), freeReasons[path], {multiple: true});
  if (path === 'provenance.unit' || /^indicators\.\d+\.unit$/.test(path)) return result(path.startsWith('indicators.')?units().filter(([v])=>v!=='各指标单位见表头'):units(), freeReasons['provenance.unit']);
  if (path === 'provenance.author' || /\.reviewedBy$/.test(path)) return result(pairs(reviewers()), freeReasons['provenance.author'], {customLabel: '填写未登记的真实核定人'});
  if (/^objects\.\d+\.label$/.test(path) || /^edges\.\d+\.(from|to)$/.test(path) || /^values\.\d+\.label$/.test(path)) return result([...objects(), ...pairs(unique([...d.objects.map(o => o.label), ...history(d, path)]))], '自拟技术路线、未登记项目或特定观测期间可能不在平台清单中，须填写真实名称，不能选一个相似对象代替。');
  if (/^indicators\.\d+\.name$/.test(path)) return result((options.indicators || c.indicatorDictionary?.indicators || []).map(i => [i.name, i.name]), '研究可能使用新指标或原表专有名称。未列入词典时须保留实际指标名称，并明确单位和定义。', {note: '词典是名称与口径建议；选择指标不会生成数值，也不表示已通过核定。'});
  if (/^indicators\.\d+\.definition$/.test(path)) {
    const i = d.indicators[Number(path.split('.')[1])], suggestion = options.indicators?.find(v => v.name === i.name)?.definition;
    return result([...(suggestion ? [[suggestion, '采用所选指标的词典/原表定义（需核定）']] : []), ['按所选来源原表的指标定义', '按所选来源原表的指标定义']], '专有指标、分母或评分手册可能与通用定义不同，须写明实际定义，避免只同名却不同口径。');
  }
  if (/^indicators\.\d+\.comparableScope$/.test(path)) return result(pairs(comparableScopes), '特殊项目的可比条件无法穷举，须明确实际比较的对象、期间、单位及边界。');
  if (/^indicators\.\d+\.frequency$/.test(path)) return result(pairs(['年度', '季度', '月度', '日度', '逐时', '项目/登记快照', '一次性观测']), '原表使用不规则或特殊统计周期时，须准确说明，不能冒充同频序列。');
  if (/\.constraintReason$/.test(path)) return result(history(d, path).map(v => [v, v]), '禁用、安全和适用性核验依赖具体标准、场地或文件。不能用“通过”选项代替可追溯的核验依据。', {customLabel: '填写具体核验文件与结论依据'});
  if (/\.sourceRef$/.test(path)) return result([...sourceChoices(), ...priorSources(), ...(d.provenance.description ? [[d.provenance.description, '采用本研究已填写的共同来源']] : [])], '尚未入库的文件、记录编号或页码无法预设，须填写能定位到这项数值的真实出处。');
  if (/^evidence\.\d+\.\d+\.period$/.test(path)) return result(pairs(unique([d.periodPreset==='all'?'':d.period, ...d.rows.map(r => r.period), ...years])), '原表可能使用跨年、阶段或特殊批次期间，须保留真实统计期间，不能用文章发布日期代替。');
  if (/\.page$/.test(path)) return result([['不适用（网页或无页码原表）', '网页或无页码原表'], ...pairs(Array.from({length: 500}, (_, i) => String(i + 1)))], '多页区间、附件表号或清单外页码需要准确定位，不能选择相近页码。');
  if (/^edges\.\d+\.type$/.test(path)) return result(pairs(options.relationTypes || ['投资', '持股', '运营', '供货', '建造', '供电', '运输', '封存', '签约', '批准', '采用', '位于', '合作']), '原文明示的特殊关系可能未列入清单，须准确写明；同篇出现两个主体不代表有合作关系。');
  if (/\.window$/.test(path)) {
    const n = d.datasetId ? c.series?.find(s => s.id === d.datasetId)?.count || 2 : d.rows.length;
    return result(Array.from({length: Math.max(0, n - 1)}, (_, i) => [i + 2, `${i + 2} 期`]), '', {number: true, custom: false, note: '窗口可选2期至当前序列总期数；正式计算仍会检查连续性和完整性。'});
  }
  if (/\.rate$/.test(path)) return result([0, .01, .03, .05, .08, .1, .12, .15, .2].map(v => [v, `每期 ${(v * 100).toFixed(0)}%`]), '项目的每期资本成本可能不是常用档位，需要保留精确值。必须另附折现率依据，不能把常用选项当作项目事实。', {number: true, note: '常用档位仅便于选择，不能代替项目批准口径；每期与现金流间隔一致。'});
  if (/\.weights\.\d+$/.test(path)) return result(unique([0, .05, .1, .15, .2, .25, .3, .4, .5, .6, .75, 1, 5, 10, 20, 25, 30, 40, 50, 60, 75, 100]).map(v => [v, String(v)]), '专家给出的原始比例可能精确到任意小数，不能强制舍入到下拉档位；系统会按总和换算成权重比例。', {number: true});
  if (/judgments\.\d+\.\d+$/.test(path)) return result([...Array.from({length: 8}, (_, i) => [1 / (9 - i), `1/${9 - i}`]), [1, '1（同等重要）'], ...Array.from({length: 8}, (_, i) => [i + 2, String(i + 2)])], '非常用正数判断须保留专家原值及依据，不能随意改成邻近标度；一致性仍须通过检验。', {number: true});
  if (/\.shocks\.\d+$/.test(path)) return result([-1, -.5, -.3, -.2, -.1, 0, .1, .2, .3, .5, 1].map(v => [v, `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`]), '外生变化幅度可能有精确的工程或情景依据，常用档位不能替代实际假设，也不表示发生概率。', {number: true});
  if (path === 'provenance.reason') {
    const wm = d.method === 'entropy-topsis' ? 'entropy' : d.method === 'ahp-topsis' ? 'ahp' : ['equal', 'manual', 'entropy', 'critic'].includes(d.method) ? d.method : params(d).weightMethod;
    const standard = {equal: '本研究采用等权设定，各指标同等重要；不声称有外部实证支持。', entropy: '按本次已核定矩阵计算熵权，权重来自数据离散信息。', critic: '按本次已核定矩阵计算CRITIC权重，保留差异与相关信息。'}[wm];
    const choices = ['manual', 'ahp'].includes(wm) || ['npv', 'scenario', 'ahp'].includes(d.method) ? [] : [d.method === 'moving' ? `采用${params(d).window}期简单移动平均，仅用于平滑描述。` : ['weighted', 'topsis', 'entropy-topsis', 'rank-robustness', 'equal', 'entropy', 'critic'].includes(d.method) ? standard : '按已核定来源、原始单位和统计期间执行所选方法，结果仍需专业审阅。'].filter(Boolean);
    return result(pairs(unique([...choices, ...history(d, path)])), freeReasons[path], {customLabel: '填写具体参数/专家判断依据'});
  }
  if (path === 'revisionReason') return result(pairs(history(d, path)), freeReasons[path], {customLabel: '填写本次具体修订依据'});
  return null;
}

function rawInput(d, path, title, opts = {}, reason = '') {
  const {type = 'text', field = '', placeholder = '', readonly = false, required = false, multiline = false, reasonId = ''} = opts;
  const whyId = reasonId || `strategy-why-${path.replace(/[^\w-]/g, '-')}`;
  const attrs = `data-path="${esc(path)}" ${field ? `data-field="${esc(field)}"` : ''} aria-label="${esc(title)}" ${reason ? `aria-describedby="${esc(whyId)}" data-free-input` : ''} ${readonly ? 'readonly' : ''} ${required ? 'required' : ''}`;
  const value = esc(getPath(d, path));
  const control = multiline ? `<textarea ${attrs} placeholder="${esc(placeholder)}">${value}</textarea>` : `<input ${attrs} type="${type}" ${type === 'number' ? 'step="any"' : ''} value="${value}" placeholder="${esc(placeholder)}">`;
  return `<span class="strategy-control">${control}${reason && !reasonId ? `<small id="${esc(whyId)}" class="strategy-input-reason">需要填写的原因：${esc(reason)}</small>` : ''}</span>`;
}

export function guidedInput(d, path, title, opts = {}) {
  if (path === 'title' || opts.readonly) return rawInput(d, path, title, opts);
  if (/^rows\.\d+\.period$/.test(path)) return periodInput(d, path, title, opts.field);
  const spec = choiceSpec(d, path);
  if (!spec) {
    const reason = opts.reason || (/\.quote$|^edges\.\d+\.evidence$/.test(path) ? '证据必须是原文中的具体内容，不能从通用句子中选择，否则会制造不存在的依据。' : opts.type === 'date' ? '仅在选择自定义范围时使用日历，精确到具体日期；常用期间可直接选择快捷选项。' : opts.type === 'number' ? '这是原始数值或已核定基线，可能为任意小数，不能预设有限档位；请保留原值，缺失不要补零。' : '原始资料可能使用特定名称或说明，系统没有可核验的固定清单，须据实填写。');
    return rawInput(d, path, title, opts, reason);
  }
  const choices = [...new Map(spec.choices.map(([v, label]) => [String(v), [v, label]])).values()];
  if (!choices.length && spec.custom !== false) return rawInput(d,path,title,opts,spec.reason);
  const value = getPath(d, path), strings = choices.map(([v]) => String(v));
  const multipleValues = spec.multiple ? String(value || '').split('\n').filter(Boolean) : [];
  const hasValue = value !== '' && value != null;
  const custom = spec.custom !== false && (d.choiceModes?.[path] === 'custom' || (spec.multiple ? multipleValues.some(v => !strings.includes(v)) : hasValue && !strings.includes(String(value))));
  const id = `strategy-choice-${path.replace(/[^\w-]/g, '-')}`;
  const selected = custom ? '__custom__' : hasValue ? String(value) : '';
  const selector = spec.multiple && !custom ? `<select id="${id}" data-choice-path="${esc(path)}" data-choice-multiple multiple hidden tabindex="-1" aria-label="${esc(title)}" ${opts.field ? `data-field="${esc(opts.field)}"` : ''}>${choices.map(([v, text]) => `<option value="${esc(v)}" ${multipleValues.includes(String(v)) ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select>${multiSelect({id: id + '-picker', sourceId: id, title, placeholder: '选择已登记的原文链接', selected: multipleValues, options: choices.map(([value, label]) => ({value, label})), hint: '勾选后即时应用，可选择多条原文链接'})}<button type="button" class="strategy-custom-link" data-custom-path="${esc(path)}">填写未登记链接</button><small class="meta">展开后可搜索、勾选多条已登记原文链接。</small>` : `<select id="${id}" data-choice-path="${esc(path)}" aria-label="${esc(title)}" ${opts.field ? `data-field="${esc(opts.field)}"` : ''}><option value="" ${selected === '' ? 'selected' : ''}>${opts.required ? '请选择' : '请选择 / 暂不单独声明'}</option>${choices.map(([v, text]) => `<option value="${esc(v)}" ${selected === String(v) ? 'selected' : ''}>${esc(text)}</option>`).join('')}${spec.custom !== false ? `<option value="__custom__" ${custom ? 'selected' : ''}>${esc(spec.customLabel || '其他 / 自定义（需说明实际口径）')}</option>` : ''}</select>`;
  return `<span class="strategy-control">${selector}${choices.length > 80 && !spec.multiple && spec.search !== false ? `<input type="search" data-choice-search="${esc(id)}" aria-label="搜索${esc(title)}选项" placeholder="搜索下拉选项（不作为研究输入）">` : ''}${spec.note ? `<small class="meta">${esc(spec.note)}</small>` : ''}${custom ? rawInput(d, path, `自定义${title}`, opts, spec.reason) : ''}</span>`;
}

export function applyChoice(d, path, value, multiple = false) {
  d.choiceModes ||= {};
  if (value === '__custom__') {d.choiceModes[path] = 'custom'; return;}
  const spec = choiceSpec(d, path);
  d.choiceModes[path] = 'preset';
  setPath(d, path, multiple ? value.join('\n') : spec?.number ? value === '' ? null : Number(value) : value);
  if (path === 'provenance.description') {
    const ref = catalogFor(d).inputOptions?.references?.find(r => `${r.title}；${r.url}` === value);
    if (ref && !d.provenance.urls) d.provenance.urls = ref.url;
  }
}

export function booleanSelect(d, path, title) {
  const optional = path.endsWith('scanEnabled');
  const incomplete = /^rows\.\d+\.partial$/.test(path);
  return `<label class="strategy-field strategy-declaration"><span>${esc(title)}</span><select data-path="${esc(path)}" data-value-type="boolean" data-field="${esc(path)}" aria-label="${esc(title)}"><option value="false" ${!getPath(d, path) ? 'selected' : ''}>${incomplete ? '完整统计期' : optional ? '不执行' : '尚未核定'}</option><option value="true" ${getPath(d, path) ? 'selected' : ''}>${incomplete ? '不完整统计期' : optional ? '执行' : '已核定，确认上述声明'}</option></select></label>`;
}

export function sizeSelect(id, title, min, max, value) {
  return `<select id="${esc(id)}" aria-label="${esc(title)}">${Array.from({length: max - min + 1}, (_, i) => i + min).map(n => `<option value="${n}" ${n === value ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
}

function periodInput(d, path, title, field) {
  const value = getPath(d, path) || '', match = value.match(/^(\d{4})(?:-(Q[1-4]|0[1-9]|1[0-2]))?$/);
  const p = match ? {frequency: !match[2] ? 'year' : match[2].startsWith('Q') ? 'quarter' : 'month', year: match[1], slot: match[2]?.replace('Q', '') || ''} : d.periodParts?.[path] || {};
  const options = (part, entries, placeholder) => `<select data-period-path="${esc(path)}" data-period-part="${part}" aria-label="${esc(title + ({frequency: '频率', year: '年份', slot: '月份或季度'}[part]))}" ${field ? `data-field="${esc(field)}"` : ''}><option value="">${placeholder}</option>${entries.map(([v, text]) => `<option value="${esc(v)}" ${p[part] === String(v) ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select>`;
  return `<span class="strategy-period-picker">${options('frequency', [['year', '年度'], ['quarter', '季度'], ['month', '月度']], '选择频率')}${options('year', pairs(unique([...years, p.year]).sort()), '选择年份')}${p.frequency === 'year' ? '' : options('slot', Array.from({length: p.frequency === 'quarter' ? 4 : 12}, (_, i) => [p.frequency === 'quarter' ? String(i + 1) : String(i + 1).padStart(2, '0'), p.frequency === 'quarter' ? `第${i + 1}季度` : `${i + 1}月`]), '选择月份/季度')}<small class="meta">按原表选择统计期，不能用采集日期代替。</small></span>`;
}

export function changePeriodPart(d, path, part, value) {
  d.periodParts ||= {};
  const old = getPath(d, path)?.match(/^(\d{4})(?:-(Q[1-4]|0[1-9]|1[0-2]))?$/);
  const p = d.periodParts[path] ||= old ? {frequency: !old[2] ? 'year' : old[2].startsWith('Q') ? 'quarter' : 'month', year: old[1], slot: old[2]?.replace('Q', '') || ''} : {};
  if (part === 'frequency' && p.frequency !== value) p.slot = '';
  p[part] = value;
  setPath(d, path, p.year && p.frequency && (p.frequency === 'year' || p.slot) ? p.year + (p.frequency === 'year' ? '' : p.frequency === 'quarter' ? '-Q' + p.slot : '-' + p.slot) : '');
}
