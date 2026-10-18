import {topicLabel} from './industry-topics.mjs';
import {formatDisplayDate} from './preview.js';
import {buildRelationshipModel,relationshipScope,relationshipOption,relationshipEntityLegend} from './quant/chart-views.js';
import {mountChartRotation} from './quant/chart-rotation.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let disposeRelationship=()=>{},relationshipEngine;
export function businessViews(data){
 const quarterly=(data.series||[]).filter(s=>s.frequency==='季度');
 const cards=(data.observations||[]).filter(o=>o.subject==='Whale项目').map(o=>`<div class="business-point"><span>${esc(o.name)}</span><strong>${esc(o.qualifier==='超过'?'> ':'')}${esc(o.rawValue)} <small>${esc(o.unit)}</small></strong><p class="meta">${esc(o.nature)} · ${esc(o.period)}</p><button data-document="${esc(o.documentId)}">原文与译文 ↗</button></div>`).join('');
 return (cards?`<section class="panel quant-evidence"><div class="panel-head"><div><small>SHELL / PROJECT DISCLOSURES</small><h2>Whale项目指标</h2></div></div><p class="meta">项目披露值，不与实际月度产量混合；预计峰值不是已实现产量，水深不是钻井深度。</p><div class="business-points">${cards}</div></section>`:'')+quarterly.map(s=>{const rows=s.rows,max=Math.max(...rows.map(r=>r.value))*1.1;return `<section class="panel quant-evidence"><div class="panel-head"><div><small>TRANSOCEAN / QUARTERLY ACTUALS</small><h2>${esc(s.name)}</h2></div><a href="${esc(s.sourceUrl)}" target="_blank" rel="noopener noreferrer">官方统计 ↗</a></div><p class="meta">${esc(s.note)}</p><svg class="change-scatter" viewBox="0 0 700 220"><path d="M45 170H670" class="scatter-axis"/>${rows.map((r,i)=>{const x=65+i*580/Math.max(1,rows.length-1),y=170-r.value/max*125;return `<g><path d="M${x} 170V${y}" style="stroke:var(--accent);stroke-width:3"/><circle class="quarter-dot" cx="${x}" cy="${y}" r="7"/><text x="${x}" y="${y-15}" text-anchor="middle">${r.value}</text><text x="${x}" y="195" text-anchor="middle">${esc(r.period)}</text><title>${esc(r.period)}：${r.value} ${esc(s.unit)}</title></g>`;}).join('')}</svg><p class="meta">单位：${esc(s.unit)} · 缺失季度不补零 · 纵轴从零起</p><details><summary>查看逐期来源和原始统计行</summary>${rows.map(r=>`<div class="row"><strong>${esc(r.period)}：${r.value} ${esc(s.unit)}</strong><p class="meta">${esc(r.quote)}<br>文章发布日期：${esc(formatDisplayDate(r.publishedAt||'未识别'))}</p><button data-document="${esc(r.documentId)}">原文与译文</button> <a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">官方来源 ↗</a></div>`).join('')}</details></section>`;}).join('')+((data.reportCatalog||[]).length&&!data.series?.every(s=>s.country!=='GLOBAL')?`<section class="panel quant-evidence"><h2>Transocean船队报告原件</h2><p class="meta">官方季度PDF索引。合同安排包含确定合同与附条件合同；本轮图表使用季度业绩公告的结构化运营统计，尚未将PDF逐船合同表自动转换为图表。</p>${data.reportCatalog.map(r=>`<p><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.label)} ↗</a></p>`).join('')}</section>`:'');
}
export function relationshipView(data){
 return `<section class="relationship-explorer" data-relationship-chart aria-label="分层产业关系浏览"><div class="relationship-intro"><div><small>CLASSIFY · EXPLORE · CONNECT</small><h3>先看产业结构，再沿主体追踪关联</h3><p>领域 → 主体类型 → 具体主体 → 关联关系</p></div><div class="relationship-stats" data-rel-stats></div></div><nav class="relationship-breadcrumbs" data-rel-breadcrumbs aria-label="当前关系分类"></nav><div class="relationship-toolbar"><div class="relationship-modes" data-rel-modes role="group" aria-label="关系图表类型"></div><div class="relationship-actions"><button data-rel-auto type="button"></button><button data-rel-reset type="button">重置分类</button></div></div><div class="relationship-layout"><section class="relationship-stage"><p class="relationship-caption" data-rel-caption role="status"></p><div class="relationship-chart-wrap"><div class="relationship-canvas" role="img" tabindex="0" aria-label="可点击下钻的产业分类图"></div><div class="relationship-chart-status" data-rel-status role="status">正在准备产业关系图…</div></div><div class="relationship-edge-tools" data-rel-edge-tools hidden></div><p class="relationship-legend" data-rel-legend></p></section><aside class="relationship-browser"><label>在当前分类中查找主体<input data-rel-search type="search" maxlength="180" placeholder="搜索名称或已记录别名" autocomplete="off"></label><div class="relationship-browser-heading" data-rel-list-heading></div><div class="relationship-browser-list" data-rel-list></div><div class="relationship-pager" data-rel-pager></div></aside></div><section class="relationship-evidence" data-rel-evidence aria-live="polite"></section></section>`;
}

function loadRelationshipEngine(){
 if(window.echarts)return Promise.resolve(window.echarts);
 return relationshipEngine ||= new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('quant/echarts.js',import.meta.url);script.onload=()=>resolve(window.echarts);script.onerror=()=>{relationshipEngine=null;reject(Error('图表引擎暂未加载，请点击重试'));};document.head.append(script);});
}

function mountRelationshipChart(host,data,openDoc){
 const life=new AbortController(),model=buildRelationshipModel(data),q=s=>host.querySelector(s);
 const scopeKey='relationship-explorer:'+['topic','country','source','from','to'].map(id=>document.getElementById(id)?.value||'').join('|');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let saved={};try{saved=JSON.parse(sessionStorage.getItem(scopeKey)||'{}');}catch{}
 const state={sector:'',entityType:'',subject:'',query:'',page:0,edgePage:0,relationType:'',view:'treemap',auto:!reduced,...saved};
 if(!model.sectors.has(state.sector))state.sector='';if(!model.nodes.has(state.subject))state.subject='';if(reduced)state.auto=false;
 let chart,engine,chartType,rotation,visibility,scope,searchTimer,selectedRecords=[],evidencePage=0,compact=q('.relationship-canvas').clientWidth<650;
 const save=()=>{try{sessionStorage.setItem(scopeKey,JSON.stringify(state));}catch{}};
 const choices=()=>scope?.subject?['graph','circular','sankey']:['treemap','tree'];
 const labels={treemap:'分类地图',tree:'层级关系',graph:'关系图',circular:'环形关系',sankey:'桑基图'};
 function evidence(){
  const rows=selectedRecords.slice(evidencePage*4,evidencePage*4+4);
  q('[data-rel-evidence]').innerHTML=rows.length?`<div class="relationship-evidence-heading"><div><small>RELATION / SOURCE EVIDENCE</small><h4>这条关联来自哪里</h4></div><span>${selectedRecords.length} 条保存记录</span></div><div class="relationship-evidence-rows">${rows.map(r=>`<article><p><strong>${esc(model.nodes.get(r.from).name)}</strong><span>${esc(r.type)} →</span><strong>${esc(model.nodes.get(r.to).name)}</strong></p><blockquote>${esc(r.proof[0]?.quoteZh||r.proof[0]?.quote||'原记录未保存摘录，可查看原文核对。')}</blockquote><div class="relationship-evidence-source"><span>${esc(r.document.titleZh||r.document.title||'来源资料')} · ${esc(formatDisplayDate(r.document.publishedAt||'日期未记录'))} · ${esc({verified:'人工确认',confirmed:'已确认',extracted:'系统提取',candidate:'候选记录'}[r.status]||'保存记录')}</span><button data-rel-document="${esc(r.document.id)}">原文与证据 ↗</button></div></article>`).join('')}</div>${selectedRecords.length>4?`<div class="relationship-pager"><button data-rel-evidence-page="-1" ${evidencePage===0?'disabled':''}>上一组</button><span>${evidencePage+1} / ${Math.ceil(selectedRecords.length/4)}</span><button data-rel-evidence-page="1" ${(evidencePage+1)*4>=selectedRecords.length?'disabled':''}>下一组</button></div>`:''}`:`<p class="meta">${scope?.subject?'悬停查看相邻关系，点击连线展开来源证据；点击其他主体继续追踪。':'点击领域和主体类型逐层进入，或搜索具体主体后查看关系图与桑基图。'}</p>`;
 }
 function draw(){
  if(!engine)return;
  const option=relationshipOption(scope,state.view,{dark:!document.body.classList.contains('light'),reduced,width:q('.relationship-canvas').clientWidth}),nextType=option.series[0].type;
  // Different series types must not reuse a hovered node's stale edge data.
  if(!chart||chartType!==nextType){chart?.dispose();chart=engine.init(q('.relationship-canvas'),null,{renderer:'canvas'});chart.on('click',chartClick);chartType=nextType;}
  chart.setOption(option,true);
  q('[data-rel-status]').hidden=scope.subject?scope.visibleRelations.length>0:scope.hierarchy.length>0;
  if(!q('[data-rel-status]').hidden)q('[data-rel-status]').textContent='当前分类没有匹配记录，可返回上一级或调整搜索。';
 }
 function render(){
  scope=relationshipScope(model,state);if(!scope.subject)state.page=scope.page;state.edgePage=scope.edgePage;
  if(state.subject&&!scope.subject){state.subject='';scope=relationshipScope(model,state);}
  if(!choices().includes(state.view))state.view=choices()[0];
  q('[data-rel-search]').value=state.query;
  const entities=scope.subject?new Set(scope.relations.flatMap(r=>[r.from,r.to])).size:scope.subjects.length;
  q('[data-rel-stats]').innerHTML=[['主体',entities],['关系记录',scope.relations.length],['来源资料',scope.documents]].map(([label,value])=>`<div><strong>${value.toLocaleString('zh-CN')}</strong><span>${label}</span></div>`).join('');
  q('[data-rel-breadcrumbs]').innerHTML=`<button data-rel-level="root" ${!state.sector&&!state.entityType&&!scope.subject?'aria-current="page"':''}>全部领域</button>${state.sector?`<span>›</span><button data-rel-level="sector">${esc(topicLabel(state.sector))}</button>`:''}${state.entityType?`<span>›</span><button data-rel-level="type">${esc(state.entityType)}</button>`:''}${scope.subject?`<span>›</span><span aria-current="page">${esc(scope.subject.name)}</span>`:''}`;
  q('[data-rel-modes]').innerHTML=choices().map(view=>`<button data-rel-view="${view}" aria-pressed="${state.view===view}">${labels[view]}</button>`).join('');
  q('[data-rel-auto]').textContent=state.auto?'自动演示 · 悬停暂停':'自动演示已暂停';q('[data-rel-auto]').setAttribute('aria-pressed',String(state.auto));
  q('[data-rel-caption]').textContent=scope.subject?`${scope.subject.name} · ${state.sector?topicLabel(state.sector):'全部领域'} · 图中显示 ${scope.visibleRelations.length?scope.edgeOffset+1:0}–${scope.edgeOffset+scope.visibleRelations.length} / ${scope.relations.length} 条关系记录`:
   state.entityType?`${state.sector?topicLabel(state.sector)+' / ':''}${state.entityType} · 点击主体进入关系图`:
   state.sector?`${topicLabel(state.sector)} · 按主体类型继续下钻`:'领域分类 → 主体类型 · 点击分类进入下一级';
  q('[data-rel-edge-tools]').hidden=!scope.subject;
  if(scope.subject)q('[data-rel-edge-tools]').innerHTML=`<label>关系类型<select data-rel-relation-type><option value="">全部关系</option>${scope.relationTypes.map(type=>`<option ${state.relationType===type?'selected':''}>${esc(type)}</option>`).join('')}</select></label><div><button data-rel-edges="-1" ${scope.edgePage===0?'disabled':''}>上一组关系</button><span>${scope.edgePage+1} / ${scope.edgePages}</span><button data-rel-edges="1" ${scope.edgePage+1>=scope.edgePages?'disabled':''}>下一组关系</button></div>`;
  q('[data-rel-legend]').innerHTML=scope.subject?`<span class="relationship-type-keys">${relationshipEntityLegend.filter(t=>scope.visibleRelations.some(r=>model.nodes.get(r.from).type===t.name||model.nodes.get(r.to).type===t.name)).map(t=>`<span><i style="background:${t.color}"></i>${t.name}</span>`).join('')}</span><span>${state.view==='sankey'?'桑基带宽表示关联记录条数，同一主体可出现在起点和对象两侧。':'节点大小表示当前范围内关联记录数，箭头沿用原记录方向；虚线表示尚未人工确认的关系。拖动节点、滚轮缩放，点击连线核对来源。'}</span>`:state.entityType?'每个方块代表一个主体，数字表示关联记录条数；点击进入关系图。':'面积表示领域内主体数，跨领域主体可分别归属；同名主体保留各自档案。';
  let items,total,page,pages;
  const button=(attrs,title,subtitle,count)=>`<button class="relationship-browser-item" ${attrs}><span><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></span><b>${count}<span> ›</span></b></button>`;
  if(!scope.subject&&!state.query&&!state.entityType){
   items=scope.hierarchy.map(n=>button(n.relationshipKind==='sector'?`data-rel-sector="${esc(n.sector)}"`:`data-rel-type="${esc(n.entityType)}"`,n.relationshipKind==='sector'?topicLabel(n.name):n.name,n.relationshipKind==='sector'?'进入主体类型':'查看具体主体',n.value));
   total=items.length;page=0;pages=1;q('[data-rel-list-heading]').textContent=state.sector?'选择主体类型':'选择产业领域';
  }else{
   let nodes=scope.subject?[...new Set(scope.relations.flatMap(r=>[r.from,r.to]))].filter(id=>id!==scope.subject.id).map(id=>({...model.nodes.get(id),degree:scope.relations.filter(r=>r.from===id||r.to===id).length})).sort((a,b)=>b.degree-a.degree||a.name.localeCompare(b.name,'zh-CN')):scope.subjects;
   total=nodes.length;pages=Math.max(1,Math.ceil(total/12));page=Math.max(0,Math.min(pages-1,state.page));state.page=page;
   items=nodes.slice(page*12,page*12+12).map(n=>button(`data-rel-entity="${esc(n.id)}"`,n.name,n.type+' · '+[...n.sectors].slice(0,2).map(topicLabel).join(' / '),n.degree));
   q('[data-rel-list-heading]').textContent=(scope.subject?'关联主体':'匹配主体')+' · '+total+' 个';
  }
  q('[data-rel-list]').innerHTML=items.join('')||'<p class="empty">当前分类没有匹配主体</p>';
  q('[data-rel-pager]').innerHTML=pages>1?`<button data-rel-page="-1" ${page===0?'disabled':''}>上一页</button><span>${page+1} / ${pages}</span><button data-rel-page="1" ${page+1>=pages?'disabled':''}>下一页</button>`:'';
  q('.relationship-canvas').setAttribute('aria-label',q('[data-rel-caption]').textContent);
  evidence();draw();save();rotation?.reset();
 }
 function chooseEntity(id){if(!model.nodes.has(id))return;state.subject=id;state.entityType=model.nodes.get(id).type;state.query='';state.page=0;state.edgePage=0;state.relationType='';state.view='graph';selectedRecords=[];render();}
 function chooseBranch(node){
  if(node.relationshipKind==='entity'){chooseEntity(node.entityId);return;}
  if(node.relationshipKind==='sector'){state.sector=node.sector;state.entityType='';}
  if(node.relationshipKind==='type'){state.sector=node.sector||state.sector;state.entityType=node.entityType;}
  state.subject='';state.page=0;state.edgePage=0;state.relationType='';selectedRecords=[];state.view='treemap';render();
 }
 async function start(){
  try{
   engine=await loadRelationshipEngine();if(life.signal.aborted||!host.isConnected)return;
   rotation=mountChartRotation(host,{views:()=>state.auto&&!reduced?choices():[state.view],current:()=>state.view,select:view=>{state.view=view;render();},interval:8000});
   visibility=new IntersectionObserver(entries=>rotation?.setVisible(entries.some(e=>e.isIntersecting)));visibility.observe(q('.relationship-canvas'));
   render();
  }catch(error){if(!life.signal.aborted){q('[data-rel-status]').hidden=false;q('[data-rel-status]').innerHTML=esc(error.message)+' <button data-rel-retry>重试</button>';}}
 }
 function chartClick(event){
  if(event.dataType==='edge'){selectedRecords=scope.visibleRelations.filter(r=>event.data.recordIds?.includes(r.id));evidencePage=0;evidence();rotation?.reset();return;}
  if(scope.subject&&event.data?.entityId)chooseEntity(event.data.entityId);else if(event.data?.relationshipKind)chooseBranch(event.data);
 }
 host.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.relDocument){openDoc(b.dataset.relDocument);return;}
  if(b.hasAttribute('data-rel-retry')){start();return;}
  if(b.dataset.relEntity){chooseEntity(b.dataset.relEntity);return;}
  if(b.dataset.relSector){chooseBranch({relationshipKind:'sector',sector:b.dataset.relSector});return;}
  if(b.dataset.relType){chooseBranch({relationshipKind:'type',entityType:b.dataset.relType});return;}
  if(b.dataset.relView){state.view=b.dataset.relView;render();return;}
  if(b.hasAttribute('data-rel-auto')){state.auto=!state.auto;render();return;}
  if(b.dataset.relPage){state.page+=Number(b.dataset.relPage);render();return;}
  if(b.dataset.relEdges){state.edgePage+=Number(b.dataset.relEdges);selectedRecords=[];render();return;}
  if(b.dataset.relEvidencePage){evidencePage+=Number(b.dataset.relEvidencePage);evidence();return;}
  if(b.hasAttribute('data-rel-reset')||b.dataset.relLevel){
   const level=b.dataset.relLevel;if(level!=='type')state.entityType='';if(level!=='type'&&level!=='sector')state.sector='';
   Object.assign(state,{subject:'',query:'',page:0,edgePage:0,relationType:'',view:'treemap'});selectedRecords=[];render();
  }
 },{signal:life.signal});
 host.addEventListener('input',event=>{if(!event.target.matches('[data-rel-search]'))return;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.query=q('[data-rel-search]').value;state.subject='';state.page=0;state.view='treemap';selectedRecords=[];render();},180);},{signal:life.signal});
 host.addEventListener('change',event=>{if(event.target.matches('[data-rel-relation-type]')){state.relationType=event.target.value;state.edgePage=0;selectedRecords=[];render();}},{signal:life.signal});
 const resize=new ResizeObserver(()=>{chart?.resize();const next=q('.relationship-canvas').clientWidth<650;if(next!==compact){compact=next;draw();}});resize.observe(q('.relationship-canvas'));
 const theme=new MutationObserver(()=>draw());theme.observe(document.body,{attributes:true,attributeFilter:['class']});
 render();start();
 return ()=>{life.abort();clearTimeout(searchTimer);rotation?.dispose();visibility?.disconnect();resize.disconnect();theme.disconnect();chart?.dispose();};
}
export function quantViews(data){return (data.series||[]).filter(s=>s.rows.length&&s.frequency==='月度').map(s=>{
 const rows=s.rows,years=[...new Set(rows.map(r=>r.period.slice(0,4)))],values=new Map(rows.map(r=>[r.period,r.value])),lo=Math.min(...rows.map(r=>r.value)),hi=Math.max(...rows.map(r=>r.value));
 const heat=years.map((year,yi)=>`<text x="8" y="${52+yi*46}">${year}</text>`+Array.from({length:12},(_,mi)=>{const period=year+'-'+String(mi+1).padStart(2,'0'),v=values.get(period),opacity=v===undefined?0:.22+.78*(v-lo)/(hi-lo||1);return `<g><rect x="${65+mi*49}" y="${30+yi*46}" width="44" height="38" rx="6" class="heat-cell" style="fill:${v===undefined?'var(--line)':'var(--accent)'};fill-opacity:${v===undefined?.3:opacity}"/><text x="${87+mi*49}" y="${53+yi*46}" text-anchor="middle" class="heat-value">${v??'—'}</text><title>${period}：${v===undefined?'未提供数据':v+' '+s.unit}</title></g>`;}).join('')).join('');
 const changes=rows.flatMap(r=>{const [y,m]=r.period.split('-').map(Number),prior=(m===1?y-1:y)+'-'+String(m===1?12:m-1).padStart(2,'0'),lastYear=(y-1)+'-'+String(m).padStart(2,'0'),p=values.get(prior),a=values.get(lastYear);return p&&a?[{...r,mom:100*(r.value/p-1),yoy:100*(r.value/a-1),prior:p,lastYear:a}]:[];});
 const mx=Math.max(1,...changes.map(r=>Math.abs(r.mom)))*1.2,my=Math.max(1,...changes.map(r=>Math.abs(r.yoy)))*1.2;
 return `<section class="panel quant-evidence"><div class="panel-head"><div><small>MONTHLY INTENSITY / OBSERVED DATA</small><h2>月度产量热力矩阵</h2></div><a href="${esc(s.sourceUrl)}" target="_blank" rel="noopener noreferrer">原始数据 ↗</a></div><p class="meta">${esc(s.name)} · ${esc(s.unit)}。颜色表示本次筛选范围内数值高低，“—”表示无数据，不能视为零。</p><div class="chart-scroll"><svg class="heatmap" viewBox="0 0 670 ${65+years.length*46}">${Array.from({length:12},(_,i)=>`<text x="${87+i*49}" y="18" text-anchor="middle">${i+1}月</text>`).join('')}${heat}</svg></div><p class="meta">色阶：${lo} → ${hi} ${esc(s.unit)} · 读取日期 ${esc(formatDisplayDate(s.checkedAt))}</p></section><section class="panel quant-evidence"><div class="panel-head"><div><small>MOM × YOY / DERIVED FROM SOURCE</small><h2>产量变化象限</h2></div></div><p class="meta">横轴：环比；纵轴：同比。每个点代表一个月。仅展示具有上月与去年同月数据的月份，不作预测或因果推断。</p>${changes.length?`<svg class="change-scatter" viewBox="0 0 660 340"><path d="M55 160H605M330 25V295" class="scatter-axis"/><text x="600" y="180" text-anchor="end">环比 +${mx.toFixed(1)}%</text><text x="55" y="180">−${mx.toFixed(1)}%</text><text x="337" y="28">同比 +${my.toFixed(1)}%</text><text x="337" y="295">−${my.toFixed(1)}%</text>${changes.map(r=>`<circle class="scatter-point" tabindex="0" cx="${330+r.mom/mx*250}" cy="${160-r.yoy/my*125}" r="7"><title>${r.period}：${r.value} ${esc(s.unit)}；环比${r.mom.toFixed(2)}%；同比${r.yoy.toFixed(2)}%；上月${r.prior}，去年同月${r.lastYear}</title></circle>`).join('')}</svg><details><summary>查看计算依据与逐月数值</summary><p class="meta">环比 =（本月值÷上月值−1）×100%；同比 =（本月值÷去年同月值−1）×100%。日均产量的百分比变化，不代表月总产量变化；仅使用筛选范围内可见数据。</p><div class="table-wrap"><table><thead><tr><th>月份</th><th>本月 / 上月 / 去年同月</th><th>环比</th><th>同比</th></tr></thead><tbody>${changes.map(r=>`<tr><td>${r.period}</td><td>${r.value} / ${r.prior} / ${r.lastYear}</td><td>${r.mom.toFixed(2)}%</td><td>${r.yoy.toFixed(2)}%</td></tr>`).join('')}</tbody></table></div></details>`:'<p class="empty">当前时间范围缺少上月或去年同月数据，请扩大时间范围。</p>'}</section>`;
 }).join('');}
export function setupEnhancements(data,openDoc){
 disposeRelationship();disposeRelationship=()=>{};const relationshipHost=document.querySelector('[data-relationship-chart]');if(relationshipHost)disposeRelationship=mountRelationshipChart(relationshipHost,data,openDoc);
 document.querySelector('#entity-tip')?.remove();const tip=document.createElement('aside');tip.id='entity-tip';tip.className='entity-tip';tip.setAttribute('role','tooltip');document.body.append(tip);
 const hide=()=>tip.classList.remove('visible');
 document.querySelectorAll('[data-entity]').forEach(node=>{const show=()=>{const r=data.relations.find(r=>r.id===node.dataset.relation),d=data.documents.find(d=>d.id===r.documentId),e=data.evidence.find(e=>r.evidenceIds.includes(e.id)),s=data.sources.find(s=>s.id===d?.sourceId);tip.innerHTML=`<small>来源证据</small><strong>${esc(d?.titleZh||d?.title)}</strong><p>${esc(s?.name)} · ${esc(formatDisplayDate(d?.publishedAt||'日期未知'))}</p><blockquote>${esc(e?.quote||d?.summaryZh||'暂无摘录')}</blockquote><span>点击节点打开原文与证据</span>`;const rect=node.getBoundingClientRect();tip.style.left=Math.max(8,Math.min(innerWidth-348,rect.left))+'px';tip.style.top='8px';tip.classList.add('visible');tip.style.top=Math.max(8,Math.min(innerHeight-tip.offsetHeight-8,rect.bottom+10))+'px';};node.onmouseenter=show;node.onfocus=show;node.onmouseleave=hide;node.onblur=hide;node.onclick=()=>{hide();openDoc(data.relations.find(r=>r.id===node.dataset.relation).documentId);};});
}
export function eventForm(data){const opts=xs=>xs.map(x=>`<option value="${esc(x.code||x)}">${esc(x.name||x)}</option>`).join('');return `<h2>录入有来源的事件</h2><p class="meta">保存后直接展示。请分别填写事件日期与文章发布日期，保留原始链接和支持事实的原文片段。</p><form id="event-form"><label>事件标题<input name="title" maxlength="240" required></label><label>事件概要<textarea name="summary" maxlength="2000" required></textarea></label><div class="form-grid"><label>领域<select name="topic">${opts(data.topics.map(t=>({code:t,name:topicLabel(t)})))}</select></label><label>事件类型<select name="type">${opts(['项目进展','签约合作','投资建设','政策发布','技术突破','运营变化','其他'])}</select></label><label>事件日期<input type="date" name="eventDate" required></label><label>文章发布日期<input type="date" name="publishedAt" required></label><label>主要国家<select name="country">${opts(data.countryOptions)}</select></label><label>关联国家（可选）<select name="relatedCountry"><option value="">不指定</option>${opts(data.countryOptions)}</select></label></div><label>来源名称<input name="sourceName" maxlength="160" required placeholder="发布机构或媒体"></label><label>原始链接<input type="url" name="url" maxlength="2000" required placeholder="https://"></label><label>支持事件的原文片段<textarea name="quote" maxlength="5000" required></textarea></label><p id="event-error" role="alert"></p><button type="submit" class="primary">保存事件</button></form>`;}
