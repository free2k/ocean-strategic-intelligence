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
 if(l.ruleVersion)parts.push(`<p>规则版本：${esc(l.ruleVersion)}</p>`);
 return parts.join('');
}
export function mountProcessingRuns(host,{api='api/processing-runs',beforeStart=()=>{}}={}){
 let generation=0,selectedScope='pending',task=null,preview=null,cursor=0,requestId=null,busy=false,disposed=false,polling=false,filter='all',follow=true;const logs=[];const life=new AbortController();
 host.classList.add('processing-console');
 host.innerHTML=`<div class="pr-top"><div><span class="pr-eyebrow">处理任务</span><h3>重新匹配与分析</h3><p class="pr-scope">正在核对可处理范围…</p></div><div class="pr-actions"><label>处理范围 <select class="pr-range"><option value="pending">待筛选</option><option value="accepted">已纳入</option><option value="excluded">已排除</option><option value="all">全部文章</option></select></label><span class="pr-badge">核对中</span><button class="pr-start primary" disabled>开始新一轮处理</button><button class="pr-stop" disabled>中断任务</button></div></div><p class="pr-feedback" role="status"></p><div class="pr-summary" hidden></div><details class="pr-log-panel" open><summary>处理日志详情 <span class="pr-log-count">0 条</span></summary><div class="pr-log-tools"><label>日志类型 <select class="pr-filter"><option value="all">全部记录</option><option value="classification">关键词匹配</option><option value="review">行业判断</option><option value="extraction">事件／数据／实体</option><option value="model">模型请求与响应</option><option value="retry">异常与重试</option></select></label><label><input type="checkbox" class="pr-follow" checked> 跟随最新记录</label><button class="pr-export">导出日志</button></div><div class="pr-logs" role="log" aria-label="处理日志"><p class="pr-empty">启动后将逐篇显示来源、日期、关键词、模型响应和提取结果。</p></div></details><dialog class="pr-confirm"><form method="dialog"><h3></h3><div class="pr-confirm-body"></div><div class="pr-dialog-actions"><button value="cancel">取消</button><button class="primary" value="confirm">确认</button></div></form></dialog>`;
 const $=s=>host.querySelector(s),feedback=msg=>{$('.pr-feedback').textContent=msg;};
 async function read(path='',options={}){const response=await fetch(api+path,{...options,signal:life.signal,headers:{'Content-Type':'application/json',...options.headers}});const payload=await response.json();if(!response.ok)throw Object.assign(Error(payload.error||'读取任务失败'),{status:response.status});return payload;}
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
  if(task){const percent=task.total?Math.floor(task.processed/task.total*100):0;$('.pr-summary').innerHTML=`<div class="pr-stage"><strong>${esc(stages[task.stage]||task.stage)}</strong><span>已处理 ${task.processed} / ${task.total} 篇</span></div><progress value="${task.processed}" max="${task.total||1}" aria-label="文章处理进度"></progress><div class="pr-counters"><span>纳入 <b>${task.accepted}</b></span><span>排除 <b>${task.excluded}</b></span><span>待筛选 <b>${task.unmatched}</b></span><span>事件 <b>${task.facts?.events||0}</b></span><span>数据 <b>${task.facts?.observations||0}</b></span><span>实体 <b>${task.facts?.entities||0}</b></span><span>待重试 <b>${task.retries?.length||0}</b></span></div><small>任务 ${esc(task.id.slice(0,8))} · 范围 ${esc(task.scopeLabel||'待筛选')} · 启动 ${esc(date(task.startedAt))} · 文章处理 ${percent}%（不代表已发布）</small>`;}
 }
 function appendLogs(rows){const box=$('.pr-logs');if(!rows.length)return;if(!logs.length)box.innerHTML='';for(const l of rows){logs.push(l);const details=logDetails(l);box.insertAdjacentHTML('beforeend',`<article class="pr-log ${['retry','model_error','failed'].includes(l.type)?'pr-warning':''}" data-type="${esc(l.type)}"><div class="pr-log-line"><time>${esc(date(l.at))}</time><span class="pr-log-tag">${esc(types[l.type]||l.type)}</span><strong>${esc(l.message)}</strong></div>${l.title?`<p class="pr-log-title">${esc(l.title)}</p>`:''}${details?`<details><summary>查看详情</summary><div class="pr-log-data">${details}</div></details>`:''}</article>`);}$('.pr-log-count').textContent=logs.length+' 条';applyFilter();if(follow)box.scrollTop=box.scrollHeight;}
 function applyFilter(){for(const row of $('.pr-logs').querySelectorAll('[data-type]'))row.hidden=filter!=='all'&&(filter==='model'?!row.dataset.type.startsWith('model'):filter==='retry'?!['retry','model_error','failed'].includes(row.dataset.type):row.dataset.type!==filter);}
 async function poll(){if(polling||disposed)return;polling=true;const epoch=generation;try{let result=await read('/current?after='+cursor);if(epoch!==generation||disposed)return;if(result.task){if(task&&task.id!==result.task.id){result=await read('/current?after=0&id='+result.task.id);if(epoch!==generation||disposed)return;cursor=0;logs.length=0;$('.pr-logs').innerHTML='';}task=result.task;appendLogs(task.logs);if(task.logs.length)cursor=task.logs.at(-1).seq;}render();}catch(e){if(!disposed)feedback(e.message);}finally{polling=false;}}
 async function confirm(title,body,button){const dialog=$('.pr-confirm');dialog.querySelector('h3').textContent=title;$('.pr-confirm-body').innerHTML=body;dialog.querySelector('[value=confirm]').textContent=button;dialog.returnValue='';dialog.showModal();return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true}));}
 $('.pr-start').addEventListener('click',async()=>{if(busy)return;busy=true;render();try{await beforeStart();preview=await read('/preview?scope='+selectedScope);if(!await confirm('确认开始新一轮处理？',`<p>${esc(preview.scope)}</p><p><b>${esc(preview.scopeLabel)}：实际处理 ${preview.count} 篇</b>，使用规则 <code>${esc(preview.ruleVersion)}</code>。</p><p>依次执行关键词匹配 → AI 复核 → 结构化提取 → 合并 → ${preview.mode==='live'?'发布网站成果':'本地发布'}。</p><p>本轮会调用模型，可能产生费用。</p><p>执行中不能重复启动，需先中断并等待安全退出。</p>`,'确认启动'))return;
   generation++;requestId||=processingRequestId();const result=await read('/start',{method:'POST',body:JSON.stringify({confirmed:true,requestId,processingScope:selectedScope,previewToken:preview.previewToken})});generation++;task=result.task;requestId=null;cursor=0;logs.length=0;$('.pr-logs').innerHTML='';appendLogs(task.logs);cursor=task.logs.at(-1)?.seq||0;feedback(preview.mode==='live'?'任务已提交；后台忙时会排队等待，完成后更新网站成果。':'任务已启动。本地预览不会修改线上数据。');
  }catch(e){feedback(e.status?'本次启动未成功：'+e.message:e.message);}finally{busy=false;render();poll();}});
 $('.pr-range').addEventListener('change',async e=>{selectedScope=e.target.value;requestId=null;busy=true;preview=null;render();try{await beforeStart();preview=await read('/preview?scope='+selectedScope);feedback('');}catch(error){feedback(error.message);}finally{busy=false;render();}});
 $('.pr-stop').addEventListener('click',async()=>{if(busy||!task)return;busy=true;render();try{if(!await confirm('确认中断当前任务？',`<p>将取消当前模型请求，并保存已完成的文章检查点。</p><p>未完成结果不会发布；系统显示“已中断”后才允许开始新一轮。</p><p>任务：${esc(task.id.slice(0,8))}</p>`,'确认中断'))return;task=(await read('/'+task.id+'/stop',{method:'POST',body:JSON.stringify({confirmed:true})})).task;feedback('正在安全退出，请等待“已中断”状态。');}catch(e){feedback(e.message);}finally{busy=false;render();poll();}});
 $('.pr-filter').addEventListener('change',e=>{filter=e.target.value;applyFilter();});$('.pr-follow').addEventListener('change',e=>{follow=e.target.checked;});
 $('.pr-export').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({taskId:task?.id,logs},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='处理日志-'+(task?.id.slice(0,8)||'empty')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 read('/preview').then(v=>{preview=v;render();return poll();}).catch(e=>feedback(e.message));const timer=setInterval(poll,1000);
 return()=>{disposed=true;life.abort();clearInterval(timer);$('.pr-confirm')?.close();host.innerHTML='';};
}
