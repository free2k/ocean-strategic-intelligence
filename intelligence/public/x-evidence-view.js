import {topicLabel} from './industry-topics.mjs';
import {formatDisplayDate} from './preview.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=(url,label)=>/^https?:\/\//.test(url||'')?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:esc(label);
function originView(o){
 const rss=o.provider==='OilPrice RSS';
 return `<div class="row">${esc(o.subscriptionName)} → ${rss?link(o.feedUrl,'RSS 发现入口'):link(o.postUrl,(o.author||'作者')+' 的推文')} ${o.articleUrl?' → '+link(o.articleUrl,'原始文章'):''}<p class="meta">${rss?'RSS 发布':'推文发布'}：${esc(o.feedPublishedAt||o.postPublishedAt||'未明确')} · 发现方式：${esc(o.relation)}</p></div>`;
}
export function xEvidenceView(d){
 if(!d.provenance?.length&&!d.discovery&&!d.context)return '';
 return `<section class="panel" style="margin-top:20px"><h3>分类与来源链</h3><p>主类别：${esc(topicLabel(d.industry?.primary)||'待分类')} · ${esc(d.industry?.reason||'')}</p><p class="meta">其他命中：${esc(d.industry?.topics?.map(topicLabel).join('、'))} · 规则版本 ${esc(d.industry?.version)}</p>${(d.provenance||[]).map(originView).join('')}${d.discovery?`<p>本条来自 ${link(d.discovery.parentPostUrl,'父推文')}，作者和日期按子推文独立保存。</p>`:''}
 <p>${link(d.url,'原始文章')} · 文章发布：${esc(formatDisplayDate(d.publishedAt||'未明确'))}</p>
 ${d.references?.length?`<details><summary>正文引用来源（尚未逐项核实）</summary>${d.references.map(r=>`<p>${link(r.url,r.label||r.url)}</p>`).join('')}</details>`:''}
 ${(d.sourceTables||[]).map(t=>`<details><summary>原始表格：${esc(t.title||'未命名')} · ${t.rows?.length||0} 行</summary><p class="meta">保留原始单元格。单位、统计期及口径待核对；未自动拼接为趋势。</p><div class="table-wrap"><table>${(t.rows||[]).slice(0,100).map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</table></div>${t.rows?.length>100?'<p>预览前100行，完整表格以原始文件为准。</p>':''}</details>`).join('')}
 ${(d.evidenceAssets||[]).map(a=>`<details><summary>图表／附件 · ${esc(a.title||a.kind||a.type)} · ${esc(a.status)}</summary><p>${link(a.url,'打开原始图表或附件')}</p><p>${esc(a.summaryZh||a.error||'等待识别或人工核对')}</p><p class="meta">${esc(a.sourceLabel)} · ${esc(a.period)}<br>坐标：${esc((Array.isArray(a.axes)?a.axes:[]).map(x=>x.label+' '+(x.unit||'')).join('；'))}<br>图例：${esc((Array.isArray(a.legends)?a.legends:[]).join('、'))}</p><pre>${esc(a.visibleText)}</pre><p class="meta">图片识别结果为候选证据；不根据曲线位置生成精确数值，示意图不进入实际时间序列。</p></details>`).join('')}</section>`;
}
