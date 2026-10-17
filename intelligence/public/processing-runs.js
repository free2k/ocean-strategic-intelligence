const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'未明确';
const stages={waiting:'等待其他批次退出',queued:'等待启动',classifying:'关键词匹配',reviewing:'AI 行业复核',extracting:'结构化提取',merging:'合并工作库',publishing:'发布结果',published:'本轮已发布',interrupted:'已中断',failed:'异常结束'};
const statuses={queued:'排队中',running:'执行中',stopping:'正在安全中断',completed:'已完成',partial:'本轮结束 · 有待重试项',interrupted:'已中断',failed:'异常结束'};
const types={waiting:'排队等待',classification:'规则匹配',model_request:'模型请求',model_response:'模型响应',model_error:'模型异常',review:'行业判断',extraction:'事实提取',checkpoint:'检查点',retry:'待重试',skipped:'跳过',published:'发布',queued:'任务创建',stopping:'中断请求',interrupted:'已中断',merging:'合并'};
const active=t=>t&&['queued','running','stopping'].includes(t.status);
// getRandomValues remains available on HTTP origins where randomUUID is absent.
export function processingRequestId(cryptoApi=globalThis.crypto){
 if(typeof cryptoApi?.randomUUID==='function')return cryptoApi.randomUUID();
 if(typeof cryptoApi?.getRandomValues!=='function')throw Error('浏览器不支持安全随机数，请使用新版浏览器');
 const bytes=cryptoApi.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function highlightHits(text,positive=[],negative=[]){
 const terms=[...new Set([...positive,...negative].filter(Boolean))].sort((a,b)=>b.length-a.length);if(!terms.length)return esc(text);
 const re=new RegExp(terms.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'gi');const source=String(text||'');let html='',at=0;
 for(const m of source.matchAll(re)){html+=esc(source.slice(at,m.index))+`<mark class="${negative.some(t=>t.toLowerCase()===m[0].toLowerCase())?'pr-hit-negative':'pr-hit-positive'}">${esc(m[0])}</mark>`;at=m.index+m[0].length;}return html+esc(source.slice(at));
}
export function logDetails(l){
 const parts=[];
 const positive=[...new Set((l.positive||[]).flatMap(p=>(p.keywords||[]).map(k=>k.keyword)))],negative=[...new Set((l.negative||[]).map(k=>k.keyword))];
 if(l.source||l.publishedAt)parts.push(`<p>渠道：${esc(l.source||'未记录')} · 报道日期：${esc(date(l.publishedAt))}</p>`);
 if(l.positive)parts.push(`<p>正向命中：${positive.map(k=>`<mark class="pr-hit-positive">${esc(k)}</mark>`).join(' ')||'无'}</p>`);
 if(l.negative)parts.push(`<p>反向命中：${negative.map(k=>`<mark class="pr-hit-negative">${esc(k)}</mark>`).join(' ')||'无'}</p>`);
 if(l.hitExcerpts?.length)parts.push(`<details><summary>查看关键词所在原文片段</summary>${l.hitExcerpts.map(s=>`<blockquote>${highlightHits(s,positive,negative)}</blockquote>`).join('')}</details>`);
 if(l.context)parts.push(`<p>海洋语境：${l.context.matched?'命中':'未命中'} ${esc((l.context.hits||[]).map(k=>k.keyword).join('、'))}</p>`);
 if(l.industry||l.reason)parts.push(`<p><strong>行业划分：${esc(l.industry||'未确定')}</strong>${l.topics?.length?' · '+esc(l.topics.join('、')):''}</p>${l.reason?`<p>${l.type==='review'?'模型判断依据摘要':'规则判断依据'}：${esc(l.reason)}</p>`:''}`);
 if(l.durationMs!=null)parts.push(`<p>${l.type==='checkpoint'?'单篇总耗时':'本步骤耗时'}：${(l.durationMs/1000).toFixed(2)} 秒</p>`);
 if(l.quote)parts.push(`<blockquote>${esc(l.quote)}</blockquote>`);
 if(l.status)parts.push(`<p>判断结果：${esc({accepted:'已纳入',excluded:'已排除',unmatched:'待筛选'}[l.status]||l.status)}</p>`);
 if(l.evidence?.length)parts.push(`<details><summary>原文依据 ${l.evidence.length} 条</summary>${l.evidence.map(e=>`<blockquote>${esc(e.quote||e.text||e.excerpt||'')}</blockquote>`).join('')}</details>`);
 for(const[key,label]of [['events','事件'],['observations','指标数据'],['entities','实体']])if(l[key])parts.push(`<div><strong>${label} ${l[key].length} 条</strong>${l[key].length?'<ul>'+l[key].map(x=>`<li>${esc(x.titleZh||x.title||x.nameZh||x.name||x.id)}${x.rawValue!=null?' · '+esc(x.rawValue)+' '+esc(x.unit||''):''}${x.eventDate?' · '+esc(x.eventDate):''}</li>`).join('')+'</ul>':'<p>未提取到有原文依据的结果。</p>'}</div>`);
 if(l.model)parts.push(`<p>模型：${esc(l.model)}${l.durationMs!=null?' · 响应耗时 '+(l.durationMs/1000).toFixed(1)+' 秒':''}${l.finishReason?' · '+esc(l.finishReason):''}${l.usage?.total_tokens?' · '+l.usage.total_tokens+' tokens':''}</p>`);
 if(l.errorType)parts.push(`<p>错误类型：${esc(l.errorType)}${l.httpStatus?' · HTTP '+l.httpStatus:''}${l.nextRetryAt?' · 最早可重试：'+date(l.nextRetryAt):''}</p>`);
 if(l.errorCode)parts.push(`<p>错误代码：${esc(l.errorCode)} · 发生阶段：${esc(stages[l.failedStage]||l.failedStage||'未记录')}</p>`);
 if(l.ruleVersion)parts.push(`<p>规则版本：${esc(l.ruleVersion)}</p>`);
 return parts.join('');
}
export async function processingResponse(response){
 const status=response.status,type=response.headers.get('content-type')||'';
 const problem=(message,transient=false)=>Object.assign(Error(message),{status,transient});
 if(status===401||status===403)throw problem('登录已失效或没有访问权限，请重新登录后刷新。');
 if([429,502,503,504].includes(status))throw problem(`服务暂时繁忙或连接中断，请稍后重试（HTTP ${status}）。`,true);
 if(!/application\/(?:[\w.-]+\+)?json\b/i.test(type))throw problem(`服务返回了异常页面，请稍后重试（HTTP ${status}）。`,true);
 let payload;try{payload=await response.json();}catch{throw problem('服务数据暂时不完整，请稍后重试。',true);}
 if(!response.ok)throw problem(payload?.error||'请求未完成，请稍后重试。',status>=500);
 if(!payload||typeof payload!=='object')throw problem('服务数据格式异常，请稍后重试。',true);
 return payload;
}
export function safeSourceUrl(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}}
const resultLabels={all:'全部日志',accepted:'纳入',excluded:'排除',unmatched:'待筛选',events:'事件',observations:'数据',entities:'实体',retry:'待重试'};
export function matchesResult(row,kind){if(['accepted','excluded','unmatched'].includes(kind))return row.type==='checkpoint'&&row.status===kind;if(kind==='retry')return row.type==='retry';return row.type==='extraction'&&(row[kind]?.length||0)>0;}
function articleCard(rows,sourceLookup=()=>null){
 const latest=rows.at(-1),find=type=>rows.findLast(l=>l.type===type),rule=find('classification'),review=find('review'),extract=find('extraction'),checkpoint=find('checkpoint'),retry=find('retry')||find('model_error'),skip=find('skipped');
 const decision=review||rule,meta=rows.find(l=>l.source||l.publishedAt)||latest;
 const outcome={accepted:'已纳入',excluded:'已排除',unmatched:'待筛选'};
 const words=(rule?.positive||[]).flatMap(p=>(p.keywords||[]).map(k=>k.keyword)),negative=(rule?.negative||[]).map(k=>k.keyword);
 const chips=(items,kind)=>[...new Set(items)].slice(0,12).map(k=>`<mark class="pr-hit-${kind}">${esc(k)}</mark>`).join(' ')||'无';
 const stage=(label,row,text)=>`<div class="pr-article-step ${row?'has-result':''}"><span>${label}</span><strong>${esc(text)}</strong></div>`;
 const sourceUrl=safeSourceUrl(rows.find(l=>safeSourceUrl(l.url))?.url||sourceLookup(meta));
 const sourceLink=sourceUrl?`<a class="pr-source" href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">核对原文 ↗</a>`:latest.documentId?`<button class="pr-source" data-source-id="${esc(latest.documentId)}">核对原文 ↗</button>`:'<span class="pr-note">未提供原文地址</span>';
 const events=rows.slice().reverse().map(l=>`<details class="pr-row-details" data-seq="${l.seq}"><summary><time>${esc(date(l.at).split(' ').at(-1))}</time><span>${esc(types[l.type]||l.type)}</span> ${esc(l.message)}</summary><div class="pr-log-data"></div></details>`).join('');
 return `<article class="pr-log pr-article ${retry?'pr-warning':''}" data-seq="${latest.seq}"><header class="pr-article-head"><span class="pr-result">${esc(retry?'待重试':checkpoint?outcome[checkpoint.status]||'结果已保存':decision?outcome[decision.status]||'处理中':'处理中')}</span><time>最近更新 ${esc(date(latest.at))}</time></header><h4 class="pr-log-title">${esc(latest.title||latest.message)}</h4><p class="pr-article-meta">渠道：${esc(meta.source||'本页未记录')} · 资讯日期：${esc(date(meta.publishedAt))}${checkpoint?.durationMs!=null?' · 单篇耗时 '+(checkpoint.durationMs/1000).toFixed(1)+' 秒':''}</p>
 ${sourceLink}<div class="pr-article-flow">${stage('01 规则匹配',rule,rule?outcome[rule.status]||'已匹配':'本页无记录')}${stage('02 AI 复核',review||skip,review?outcome[review.status]||'已判断':skip?'已跳过':'本页无结果')}${stage('03 事实提取',extract,extract?`事件 ${extract.events?.length||0} · 数据 ${extract.observations?.length||0} · 实体 ${extract.entities?.length||0}`:'本页无结果')}</div>
 ${rule?`<div class="pr-keywords"><span>正向命中 ${chips(words,'positive')}</span><span>反向命中 ${chips(negative,'negative')}</span></div>`:''}
 ${decision?`<div class="pr-decision"><b>行业：${esc(decision.industry||'未确定')}</b><p>${review?'AI 判断依据':'规则判断依据'}：${esc(decision.reason||'未记录依据')}</p></div>`:''}
 ${skip?`<p class="pr-note">${esc(skip.message)}</p>`:''}${retry?`<p class="pr-note pr-error">${esc(retry.errorType||'处理异常')} · ${esc(retry.message)}</p>`:''}
 <div class="pr-card-events"><p>本页过程记录 ${rows.length} 条 · 点击查看原文依据、模型响应与提取明细</p>${events}</div></article>`;
}
export function mountProcessingRuns(host,{api='api/processing-runs',beforeStart=()=>{},sourceDocuments=[]}={}){
 let generation=0,selectedScope='pending',task=null,preview=null,cursor=0,requestId=null,busy=false,disposed=false,polling=false,filter='all',follow=true,totalLogs=0,pageStart=0,viewBusy=false,viewVersion=0,resultTab='all',resultEnd=0,resultNext=0,resultHistory=[],resultLoading=false,resultVersion=0,pollFailures=0,nextPollAt=0;const PAGE_SIZE=50,logs=[];const life=new AbortController();
 const sourceIndex=new Map();let sourceLoaded=sourceDocuments.length>0;
 const sourceKey=d=>JSON.stringify([d.title,d.sourceName||d.source,d.publishedAt?new Date(d.publishedAt).getTime():null]);
 function indexSources(documents){for(const d of documents){for(const key of [d.id,d.workingId,sourceKey(d)].filter(Boolean)){const url=safeSourceUrl(d.url);if(sourceIndex.has(key)&&sourceIndex.get(key)!==url)sourceIndex.set(key,null);else if(!sourceIndex.has(key))sourceIndex.set(key,url);}}}
 indexSources(sourceDocuments);
 const sourceLookup=row=>sourceIndex.get(row.documentId)||sourceIndex.get(sourceKey(row));
 const styleRoot=host.getRootNode(),styleParent=styleRoot instanceof ShadowRoot?styleRoot:document.head;
 if(!styleParent.querySelector('link[data-processing-style]')){const link=document.createElement('link');link.dataset.processingStyle='true';link.rel='stylesheet';link.href=new URL('./processing-runs.css?v=result-tabs-3',import.meta.url);styleParent.append(link);}
 host.classList.add('processing-console');
 host.innerHTML=`<div class="pr-top"><div><span class="pr-eyebrow">处理任务</span><h3>重新匹配与分析</h3><p class="pr-scope">正在核对可处理范围…</p></div><div class="pr-actions"><label>处理范围 <select class="pr-range"><option value="pending">待筛选</option><option value="accepted">已纳入</option><option value="excluded">已排除</option><option value="all">全部文章</option></select></label><span class="pr-badge">核对中</span><button class="pr-start primary" disabled>开始新一轮处理</button><button class="pr-stop" disabled>中断任务</button></div></div><p class="pr-feedback" role="status"></p><p class="pr-connection" role="status" hidden></p><div class="pr-summary" hidden></div><details class="pr-log-panel" open><summary>处理日志详情 <span class="pr-log-count">0 条</span></summary><div class="pr-log-tools"><label>日志类型 <select class="pr-filter"><option value="all">全部记录</option><option value="classification">关键词匹配</option><option value="review">行业判断</option><option value="extraction">事件／数据／实体</option><option value="model">模型请求与响应</option><option value="retry">异常与重试</option></select></label><label><input type="checkbox" class="pr-follow" checked> 跟随最新记录</label><button class="pr-export">导出完整日志</button></div><div class="pr-log-nav"><button class="pr-older">更早记录</button><button class="pr-newer">更新记录</button><button class="pr-latest">回到实时</button><span class="pr-window" role="status"></span></div><div class="pr-logs" role="region" aria-label="处理日志"><p class="pr-empty">启动后将逐篇显示来源、日期、关键词、模型响应和提取结果。</p></div></details><dialog class="pr-confirm"><form method="dialog"><h3></h3><div class="pr-confirm-body"></div><div class="pr-dialog-actions"><button value="cancel">取消</button><button class="primary" value="confirm">确认</button></div></form></dialog>`;
 const $=s=>host.querySelector(s),feedback=msg=>{$('.pr-feedback').textContent=msg;};
 function connection(message=''){const el=$('.pr-connection');el.textContent=message;el.hidden=!message;}
 async function read(path='',options={}){
  try{return await processingResponse(await fetch(api+path,{...options,signal:AbortSignal.any([life.signal,AbortSignal.timeout(30000)]),headers:{'Content-Type':'application/json',...options.headers}}));}
  catch(error){if(error.name==='TimeoutError')throw Object.assign(Error('读取服务超时，请稍后重试。'),{transient:true});if(error instanceof TypeError)throw Object.assign(Error('暂时无法连接服务，请检查网络或稍后重试。'),{transient:true});throw error;}
 }
 function render(){if(disposed)return;
  if(active(task)){selectedScope=task.processingScope||'pending';$('.pr-range').value=selectedScope;}
  $('.pr-scope').textContent=preview?.enabled?`${preview.scope} · ${preview.count} 篇 · 规则 ${preview.ruleVersion} · ${preview.cutoff} 之前仅关键词匹配`:(preview?.reason||'正在核对范围…');
  if(active(task))$('.pr-scope').textContent=`本轮范围：${task.scopeLabel||'待筛选'} · ${task.total} 篇 · 规则 ${task.ruleVersion}`;
  else if(preview?.processingScope&&preview.processingScope!==selectedScope)$('.pr-scope').textContent='当前选择：'+$('.pr-range').selectedOptions[0].textContent+'；启动前将重新核对实际篇数。';
  $('.pr-badge').textContent=task?statuses[task.status]||task.status:preview?.enabled?'待启动':'尚未启用';
  $('.pr-range').disabled=busy||active(task);
  $('.pr-start').disabled=busy||active(task)||!preview?.enabled||!preview.modelAvailable||!preview.count;
  $('.pr-stop').disabled=busy||!active(task)||task.status==='stopping'||task.stage==='publishing';
  $('.pr-summary').hidden=!task;
  if(task){const percent=task.total?Math.floor(task.processed/task.total*100):0;$('.pr-summary').innerHTML=`<div class="pr-stage"><strong>${esc(stages[task.stage]||task.stage)}</strong><span>已处理 ${task.processed} / ${task.total} 篇</span></div><progress value="${task.processed}" max="${task.total||1}" aria-label="文章处理进度"></progress><div class="pr-counters" role="tablist" aria-label="本轮处理结果">${Object.entries(resultLabels).map(([key,label])=>{const count={all:task.processed,accepted:task.accepted,excluded:task.excluded,unmatched:task.unmatched,events:task.facts?.events||0,observations:task.facts?.observations||0,entities:task.facts?.entities||0,retry:task.retries?.length||0}[key];return `<button role="tab" aria-selected="${resultTab===key}" data-result="${key}">${label}<b>${count}</b></button>`;}).join('')}</div><small>任务 ${esc(task.id.slice(0,8))} · 范围 ${esc(task.scopeLabel||'待筛选')} · 启动 ${esc(date(task.startedAt))} · 文章处理 ${percent}%（不代表已发布）</small>`;}
 }
 function matches(l){return filter==='all'||(filter==='model'?l.type.startsWith('model'):filter==='retry'?['retry','model_error','failed'].includes(l.type):l.type===filter);}
 function logNavigation(){
  $('.pr-log-count').textContent=`累计 ${totalLogs} 条`;
  $('.pr-filter').disabled=resultTab!=='all';$('.pr-follow').disabled=resultTab!=='all';
  if(resultTab!=='all'){
   $('.pr-window').textContent=resultLoading?`正在查找本轮「${resultLabels[resultTab]}」结果…`:`本轮全部已处理结果 · ${resultLabels[resultTab]} · 第 ${resultHistory.length+1} 页 · 本页 ${new Set(logs.map(l=>l.documentId).filter(Boolean)).size} 篇 · 事件/数据/实体统计为条数，列表按文章展示 · 点击“刷新结果”查看新增结果`;
   $('.pr-older').textContent='下一页';$('.pr-newer').textContent='上一页';$('.pr-latest').textContent='刷新结果';
   $('.pr-older').disabled=resultLoading||resultNext<=0;$('.pr-newer').disabled=resultLoading||!resultHistory.length;$('.pr-latest').disabled=resultLoading;$('.pr-follow').checked=false;return;
  }
  $('.pr-older').textContent='更早记录';$('.pr-newer').textContent='更新记录';$('.pr-latest').textContent='回到实时';
  $('.pr-window').textContent=`${follow?'实时更新 · 最新在上':'正在查看历史 · 进度仍实时更新'} · ${logs.length?`${logs[0].seq}–${logs.at(-1).seq}`:'0'} / ${totalLogs} 条 · 按文章归组，筛选当前页`;
  $('.pr-older').disabled=viewBusy||pageStart<=0;$('.pr-newer').disabled=viewBusy||pageStart+PAGE_SIZE>=totalLogs;$('.pr-latest').disabled=viewBusy;$('.pr-follow').checked=follow;
 }
 function renderLogs(){
  const groups=new Map();for(const l of logs){const key=l.documentId||'system-'+l.seq;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(l);}
  const cards=[...groups.values()].filter(rows=>resultTab!=='all'||rows.some(matches)).sort((a,b)=>b.at(-1).seq-a.at(-1).seq);
  $('.pr-logs').innerHTML=cards.map(rows=>articleCard(rows,sourceLookup)).join('')||'<p class="pr-empty">当前范围没有符合条件的文章记录。</p>';
  logNavigation();
 }
 function appendLogs(rows){logs.splice(0,logs.length,...rows.slice(-PAGE_SIZE));totalLogs=task?.lastSeq||rows.at(-1)?.seq||0;pageStart=Math.max(0,(logs[0]?.seq||1)-1);renderLogs();}
 async function loadResultPage(end){
  const version=++resultVersion,id=task?.id,kind=resultTab;if(!id||kind==='all')return;resultLoading=true;resultEnd=end;resultNext=0;logs.length=0;renderLogs();
  const selected=new Map();let upper=end;
  try{
   const total={accepted:task.accepted,excluded:task.excluded,unmatched:task.unmatched,retry:task.retries?.length||0,events:task.facts?.events||0,observations:task.facts?.observations||0,entities:task.facts?.entities||0}[kind];
   if(total===0)upper=0;
   while(upper>0&&selected.size<20){
    const after=Math.max(0,upper-200),result=await read('/current?after='+after+'&id='+id);
    if(disposed||version!==resultVersion||task?.id!==id)return;
    const batch=(result.task?.logs||[]).filter(l=>l.seq<=upper);if(!batch.length)throw Error('未能读取历史结果，请刷新重试');
    for(const row of batch.slice().reverse())if(row.documentId&&matchesResult(row,kind)&&!selected.has(row.documentId)){
     selected.set(row.documentId,batch.filter(l=>l.documentId===row.documentId));if(selected.size===20){resultNext=row.seq-1;break;}
    }
    upper=after;
   }
   if(disposed||version!==resultVersion)return;
   logs.splice(0,logs.length,...[...selected.values()].flat().sort((a,b)=>a.seq-b.seq));renderLogs();$('.pr-logs').scrollTop=0;
  }catch(e){if(!disposed&&version===resultVersion)feedback(e.message);}finally{if(version===resultVersion){resultLoading=false;if(!disposed)logNavigation();}}
 }
 $('.pr-summary').addEventListener('click',e=>{const button=e.target.closest('[data-result]');if(!button||!task)return;
  resultTab=button.dataset.result;resultVersion++;viewVersion++;resultLoading=false;resultHistory=[];follow=resultTab==='all';filter='all';$('.pr-filter').value='all';$('.pr-log-panel').open=true;render();
  if(resultTab==='all'){logs.length=0;loadPage(Math.max(0,totalLogs-PAGE_SIZE));}else loadResultPage(totalLogs);
 });
 $('.pr-summary').addEventListener('keydown',e=>{const tab=e.target.closest('[data-result]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...$('.pr-summary').querySelectorAll('[data-result]')],index=tabs.indexOf(tab),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;const key=tabs[next].dataset.result;tabs[next].click();$('.pr-summary').querySelector(`[data-result="${key}"]`)?.focus();});
 $('.pr-logs').addEventListener('click',async e=>{const button=e.target.closest('[data-source-id]');if(!button||button.disabled)return;
  const popup=window.open('about:blank','_blank');if(popup)popup.opener=null;
  button.disabled=true;button.textContent='正在读取来源…';
  try{if(!sourceLoaded){const response=await fetch(new URL('api/classification-audit',new URL('.',import.meta.url)),{signal:life.signal});const payload=await processingResponse(response);indexSources(payload.documents||[]);sourceLoaded=true;}
   const row=logs.find(l=>l.documentId===button.dataset.sourceId),url=row&&sourceLookup(row);if(!url)throw Error('未找到唯一对应的原文地址，请到情报证据中心核对该文章');
   const link=document.createElement('a');link.className='pr-source';link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='打开原文 ↗';button.replaceWith(link);if(popup)popup.location.replace(url);else link.focus();
  }catch(error){popup?.close();if(!disposed){button.disabled=false;button.textContent='重试读取原文链接';feedback(error.message);}}
 });
 async function loadPage(start){
  if(!task||viewBusy)return;viewBusy=true;const version=++viewVersion,id=task.id;logNavigation();
  try{const result=await read('/current?after='+start+'&id='+id);if(disposed||version!==viewVersion||task?.id!==id||resultTab!=='all')return;
   totalLogs=result.task?.lastSeq||totalLogs;pageStart=start;logs.splice(0,logs.length,...(result.task?.logs||[]).slice(0,PAGE_SIZE));renderLogs();$('.pr-logs').scrollTop=0;
  }catch(e){if(!disposed)connection(e.message+' 日志暂未更新，将自动重试。');}finally{viewBusy=false;if(!disposed)logNavigation();}
 }
 async function poll(){if(polling||disposed||Date.now()<nextPollAt)return;polling=true;const epoch=generation;try{
  const result=await read('/current?after='+Number.MAX_SAFE_INTEGER);if(epoch!==generation||disposed)return;pollFailures=0;nextPollAt=0;connection();
  if(!preview){try{preview=await read('/preview?scope='+selectedScope);}catch(e){connection(e.message);}}
  if(result.task){const changed=task?.id!==result.task.id;task=result.task;totalLogs=task.lastSeq||0;
   if(changed){viewVersion++;resultVersion++;resultLoading=false;resultTab='all';logs.length=0;pageStart=0;follow=true;}
   render();logNavigation();
   if(resultTab==='all'&&!viewBusy&&((follow&&$('.pr-log-panel').open&&logs.at(-1)?.seq!==totalLogs)||changed))await loadPage(Math.max(0,totalLogs-PAGE_SIZE));
  }else render();
 }catch(e){if(!disposed){pollFailures++;const delay=Math.min(30000,1000*2**Math.min(pollFailures,5));nextPollAt=[401,403].includes(e.status)?Infinity:Date.now()+delay;connection(e.message+([401,403].includes(e.status)?'':` 将在 ${delay/1000} 秒后自动重试；当前保留上次读取的任务状态。`));}}finally{polling=false;}}
 $('.pr-logs').addEventListener('toggle',e=>{const detail=e.target;if(!detail.matches('.pr-row-details')||!detail.open)return;
  follow=false;viewVersion++;logNavigation();if(detail.dataset.loaded)return;
  const row=logs.find(l=>String(l.seq)===detail.closest('[data-seq]').dataset.seq);if(row){detail.querySelector('.pr-log-data').innerHTML=logDetails(row)||'<p>无额外详情。</p>';detail.dataset.loaded='true';}
 },true);
 $('.pr-older').addEventListener('click',()=>{if(resultTab!=='all'){resultHistory.push(resultEnd);loadResultPage(resultNext);return;}follow=false;loadPage(Math.max(0,pageStart-PAGE_SIZE));});
 $('.pr-newer').addEventListener('click',()=>{if(resultTab!=='all'){loadResultPage(resultHistory.pop());return;}follow=false;loadPage(Math.min(Math.max(0,totalLogs-PAGE_SIZE),pageStart+PAGE_SIZE));});
 $('.pr-latest').addEventListener('click',()=>{if(resultTab!=='all'){resultHistory=[];loadResultPage(totalLogs);return;}follow=true;loadPage(Math.max(0,totalLogs-PAGE_SIZE));});
 $('.pr-log-panel').addEventListener('toggle',()=>{if($('.pr-log-panel').open)poll();});
 async function confirm(title,body,button){const dialog=$('.pr-confirm');dialog.querySelector('h3').textContent=title;$('.pr-confirm-body').innerHTML=body;dialog.querySelector('[value=confirm]').textContent=button;dialog.returnValue='';dialog.showModal();return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true}));}
 $('.pr-start').addEventListener('click',async()=>{if(busy)return;busy=true;render();try{await beforeStart();preview=await read('/preview?scope='+selectedScope);if(!await confirm('确认开始新一轮处理？',`<p>${esc(preview.scope)}</p><p><b>${esc(preview.scopeLabel)}：实际处理 ${preview.count} 篇</b>，使用规则 <code>${esc(preview.ruleVersion)}</code>。</p><p>依次执行关键词匹配 → AI 复核 → 结构化提取 → 合并 → ${preview.mode==='live'?'发布网站成果':'本地发布'}。</p><p>本轮会调用模型，可能产生费用。</p><p>执行中不能重复启动，需先中断并等待安全退出。</p>`,'确认启动'))return;
   generation++;viewVersion++;requestId||=processingRequestId();const result=await read('/start',{method:'POST',body:JSON.stringify({confirmed:true,requestId,processingScope:selectedScope,previewToken:preview.previewToken})});generation++;task=result.task;requestId=null;cursor=0;logs.length=0;$('.pr-logs').innerHTML='';appendLogs(task.logs);cursor=task.logs.at(-1)?.seq||0;feedback(preview.mode==='live'?'任务已提交；后台忙时会排队等待，完成后更新网站成果。':'任务已启动。本地预览不会修改线上数据。');
  }catch(e){feedback(e.status?'本次启动未成功：'+e.message:e.message);}finally{busy=false;render();poll();}});
 $('.pr-range').addEventListener('change',async e=>{selectedScope=e.target.value;requestId=null;busy=true;preview=null;render();try{await beforeStart();preview=await read('/preview?scope='+selectedScope);feedback('');}catch(error){feedback(error.message);}finally{busy=false;render();}});
 $('.pr-stop').addEventListener('click',async()=>{if(busy||!task)return;busy=true;render();try{if(!await confirm('确认中断当前任务？',`<p>将取消当前模型请求，并保存已完成的文章检查点。</p><p>未完成结果不会发布；系统显示“已中断”后才允许开始新一轮。</p><p>任务：${esc(task.id.slice(0,8))}</p>`,'确认中断'))return;task=(await read('/'+task.id+'/stop',{method:'POST',body:JSON.stringify({confirmed:true})})).task;feedback('正在安全退出，请等待“已中断”状态。');}catch(e){feedback(e.message);}finally{busy=false;render();poll();}});
 $('.pr-filter').addEventListener('change',e=>{filter=e.target.value;renderLogs();});$('.pr-follow').addEventListener('change',e=>{follow=e.target.checked;viewVersion++;logNavigation();if(follow)loadPage(Math.max(0,totalLogs-PAGE_SIZE));});
 $('.pr-export').addEventListener('click',async()=>{
  if(!task)return;const button=$('.pr-export'),id=task.id,end=totalLogs;button.disabled=true;
  try{const chunks=[];let after=0;while(after<end){button.textContent=`正在导出 ${after} / ${end}`;
   const result=await read('/current?after='+after+'&id='+id),rows=(result.task?.logs||[]).filter(l=>l.seq<=end);if(!rows.length)throw Error('历史日志读取不完整，请重试');
   chunks.push(rows.map(l=>JSON.stringify(l)).join('\n')+'\n');after=rows.at(-1).seq;
  }const url=URL.createObjectURL(new Blob(chunks,{type:'application/x-ndjson'})),a=document.createElement('a');a.href=url;a.download='处理日志-'+id.slice(0,8)+'.jsonl';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){if(!disposed)feedback(e.message);}finally{button.disabled=false;button.textContent='导出完整日志';}
 });
 read('/preview').then(v=>{preview=v;render();}).catch(e=>connection(e.message));poll();const timer=setInterval(poll,1000);
 return()=>{disposed=true;life.abort();clearInterval(timer);$('.pr-confirm')?.close();host.innerHTML='';};
}
