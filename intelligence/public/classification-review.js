const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）':'未记录';
export function reviewState(d){
 const c=d.classification||{},s=c.semantic||{},q=d.semanticQueue;
 if(c.manual||c.method==='manual')return {status:'manual',label:'人工分类优先',note:'当前采用人工结论，模型不覆盖人工结果。'};
 if(q&&q.version===c.version&&['pending','running','failed'].includes(q.status))return {status:q.status,label:{pending:'排队中',running:'处理中',failed:'失败待重试'}[q.status],note:q.status==='failed'?'本轮复核未完成，不能视为“不相关”。':q.status==='running'?'正在处理，尚无本轮结论。':'已进入复核队列，尚无本轮结论。'};
 if(q?.status==='stale'||q&&q.version!==c.version)return {status:'stale',label:'旧任务已失效',note:'文章或规则已有变化，旧任务不能作为当前模型结论。'};
 if(s.status==='completed')return {status:'completed',label:'已完成',note:'模型辅助判断，不等于人工核验。'};
 if(c.method==='llm')return {status:'legacy',label:'模型判断详情不完整',note:'记录标注了模型分类，但未保存完整复核信息，不补造模型名称、时间或依据。'};
 if(q?.status==='completed')return {status:'sync',label:'队列已完成，详情未同步',note:'队列已完成，但当前分类记录未保存完整模型详情，请刷新后核对。'};
 if(s.status==='pending')return {status:'unknown',label:'曾提交复核，当前状态未确认',note:'仅保存了待复核标记，未取得可核对的当前队列状态。'};
 return {status:'none',label:'未记录模型复核',note:'当前记录未保存模型结论；查看依据不会触发模型调用。'};
}
function keywords(c,negative=false){const list=negative?c.negative||[]:(c.positive||[]).flatMap(p=>p.keywords||[]);const words=[...new Set(list.map(k=>typeof k==='string'?k:k.keyword).filter(Boolean))];return words.length?words.map(w=>`<span class="keyword ${negative?'negative':'positive'}">${esc(w)}</span>`).join(' '):'<span class="muted">未记录命中词</span>';}
export function renderClassificationReview(d){
 const c=d.classification||{},s=c.semantic||{},q=d.semanticQueue||{},state=reviewState(d),complete=state.status==='completed';
 const ruleReason=c.ruleReason||(!c.manual&&c.method!=='manual'&&c.method!=='llm'?c.reason:null)||'未保存独立规则判断理由';
 const fields=(label,value)=>`<p><strong>${label}：</strong>${esc(value)}</p>`;
 return `<div class="classification-reason" style="overflow-wrap:anywhere">
 <section class="rule-review-block" aria-label="规则判断" style="border-bottom:1px solid var(--border,#33495a);padding-bottom:12px"><h4>规则判断</h4>${fields('判断理由',ruleReason)}
 <div class="match-group"><small>正向命中关键词</small>${keywords(c)}</div><div class="match-group negative-match"><small>反向命中关键词</small>${keywords(c,true)}</div>
 ${c.context?fields('海洋语境',c.context.matched?'规则检出海洋场景词':'规则未检出海洋场景词')+(c.context.hits?.length?fields('语境命中',c.context.hits.map(h=>h.keyword+'（'+h.field+'）').join('、')):''):''}
 </section><section class="model-review-block" aria-label="大模型复核" style="padding-top:12px"><h4>大模型复核 <span class="classification-method">${esc(state.label)}</span></h4><p class="muted">${esc(state.note)}</p>
 ${fields('是否相关',complete?(s.relevant===true||c.status==='accepted'?'是，模型确认直接相关':s.relevant===false?'未确认直接相关（不相关或证据不足）':'未确认直接相关（按保存结果）'):'尚无可展示的本轮结论')}
 ${fields('所属行业',complete?(c.primary||'未确定'): '未确定')}
 ${fields('判断理由',complete?(s.reason||c.reason||'未记录'):state.status==='failed'?(q.error||state.note):state.note)}
 ${complete?`<details><summary>复核时的规则正反命中关键词</summary><p class="muted">保留的规则命中记录，不是模型新提取的关键词。</p><div>正向：${keywords(c)}</div><div>反向：${keywords(c,true)}</div></details>`:''}
 ${complete&&s.quote?`<details class="model-proof"><summary>原文依据 · 展开查看</summary><blockquote style="white-space:pre-wrap;max-height:260px;overflow:auto">${esc(s.quote)}</blockquote></details>`:'<p>原文依据：未保存可展示的本轮模型引文</p>'}
 ${fields('模型',complete?s.model||'未记录':'未记录本轮执行模型')}${fields('复核时间',complete?time(s.reviewedAt):'未记录')}
 ${['pending','running','failed'].includes(state.status)?fields('队列更新时间',time(q.updatedAt))+(state.status==='failed'?fields('最早可重试时间',time(q.nextRetryAt)):''):''}
 ${s.inputTruncated&&complete?'<p class="muted">本次判断仅使用提供的正文前32000字符。</p>':''}
 </section></div>`;
}
