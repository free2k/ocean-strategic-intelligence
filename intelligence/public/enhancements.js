import {topicLabel,canonicalTopic} from './industry-topics.mjs';
import {formatDisplayDate} from './preview.js';
import {buildRelationshipModel,refineRelationshipModel,relationshipNetwork,relationshipGraphOption,searchRelationshipNodes,relationshipEntityLegend} from './quant/chart-views.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let disposeRelationship=()=>{},relationshipEngine;
export function businessViews(data){
 const quarterly=(data.series||[]).filter(s=>s.frequency==='季度');
 const cards=(data.observations||[]).filter(o=>o.subject==='Whale项目').map(o=>`<div class="business-point"><span>${esc(o.name)}</span><strong>${esc(o.qualifier==='超过'?'> ':'')}${esc(o.rawValue)} <small>${esc(o.unit)}</small></strong><p class="meta">${esc(o.nature)} · ${esc(o.period)}</p><button data-document="${esc(o.documentId)}">原文与译文 ↗</button></div>`).join('');
 return (cards?`<section class="panel quant-evidence"><div class="panel-head"><div><small>SHELL / PROJECT DISCLOSURES</small><h2>Whale项目指标</h2></div></div><p class="meta">项目披露值，不与实际月度产量混合；预计峰值不是已实现产量，水深不是钻井深度。</p><div class="business-points">${cards}</div></section>`:'')+quarterly.map(s=>{const rows=s.rows,max=Math.max(...rows.map(r=>r.value))*1.1;return `<section class="panel quant-evidence"><div class="panel-head"><div><small>TRANSOCEAN / QUARTERLY ACTUALS</small><h2>${esc(s.name)}</h2></div><a href="${esc(s.sourceUrl)}" target="_blank" rel="noopener noreferrer">官方统计 ↗</a></div><p class="meta">${esc(s.note)}</p><svg class="change-scatter" viewBox="0 0 700 220"><path d="M45 170H670" class="scatter-axis"/>${rows.map((r,i)=>{const x=65+i*580/Math.max(1,rows.length-1),y=170-r.value/max*125;return `<g><path d="M${x} 170V${y}" style="stroke:var(--accent);stroke-width:3"/><circle class="quarter-dot" cx="${x}" cy="${y}" r="7"/><text x="${x}" y="${y-15}" text-anchor="middle">${r.value}</text><text x="${x}" y="195" text-anchor="middle">${esc(r.period)}</text><title>${esc(r.period)}：${r.value} ${esc(s.unit)}</title></g>`;}).join('')}</svg><p class="meta">单位：${esc(s.unit)} · 缺失季度不补零 · 纵轴从零起</p><details><summary>查看逐期来源和原始统计行</summary>${rows.map(r=>`<div class="row"><strong>${esc(r.period)}：${r.value} ${esc(s.unit)}</strong><p class="meta">${esc(r.quote)}<br>文章发布日期：${esc(formatDisplayDate(r.publishedAt||'未识别'))}</p><button data-document="${esc(r.documentId)}">原文与译文</button> <a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">官方来源 ↗</a></div>`).join('')}</details></section>`;}).join('')+((data.reportCatalog||[]).length&&!data.series?.every(s=>s.country!=='GLOBAL')?`<section class="panel quant-evidence"><h2>Transocean船队报告原件</h2><p class="meta">官方季度PDF索引。合同安排包含确定合同与附条件合同；本轮图表使用季度业绩公告的结构化运营统计，尚未将PDF逐船合同表自动转换为图表。</p>${data.reportCatalog.map(r=>`<p><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.label)} ↗</a></p>`).join('')}</section>`:'');
}
export function relationshipView(){
 return `<section class="relationship-explorer" data-relationship-chart aria-label="可逐层放大的产业关系图">
  <div class="relationship-top-actions"><button data-rel-expand type="button" aria-pressed="true">一键全展开</button><button data-rel-search-toggle type="button" aria-expanded="false" aria-controls="relationship-search-panel">一键搜索</button></div>
  <div class="relationship-intro"><div><small>INDUSTRY / CONNECTED NETWORK</small><h3>沿节点放大，逐层看清产业关联</h3><p>领域 → 主体类型 → 具体主体 → 关联关系</p></div><div class="relationship-stats" data-rel-stats></div></div>
  <section class="relationship-refinements" aria-label="产业关联图谱二级筛选"><div class="relationship-refinement-heading"><strong>二级筛选</strong><span data-rel-refine-count role="status"></span><button data-rel-refine-reset type="button">重置二级</button></div><p class="relationship-primary-scope" data-rel-primary-scope></p><div class="relationship-refinement-fields"><label>主体类型<select data-rel-entity-type aria-label="二级主体类型"></select></label><label>关系类型<select data-rel-relation-type aria-label="二级关系类型"></select></label></div><p class="relationship-refinement-note">在一级范围内进一步筛选；保留所选类型主体及其关联对象。</p></section>
  <nav class="relationship-breadcrumbs" data-rel-breadcrumbs aria-label="当前关系范围"></nav>
  <div class="relationship-layout"><section class="relationship-stage"><div class="relationship-stage-heading"><p class="relationship-caption" data-rel-caption role="status"></p><span class="relationship-expanded-badge">关系图 · 全部展开</span></div>
   <div class="relationship-chart-wrap"><div class="relationship-canvas" role="img" tabindex="0" aria-label="全部展开的产业关系图"></div><div class="relationship-chart-status" data-rel-status role="status">正在准备产业关系图…</div></div>
   <div class="relationship-map-controls"><span data-rel-hint>点击节点放大下钻 · 滚轮缩放 · 拖动画布平移</span><div><button data-rel-zoom="in" aria-label="放大关系图">＋</button><button data-rel-zoom="out" aria-label="缩小关系图">−</button><button data-rel-zoom="fit">适应画布</button></div></div>
   <p class="relationship-legend" data-rel-legend></p>
  </section><aside class="relationship-browser" id="relationship-search-panel" data-rel-search-panel hidden aria-label="搜索图谱节点"><div class="relationship-search-heading"><strong>搜索并定位主体</strong><button data-rel-search-close aria-label="关闭节点搜索">×</button></div><label>在当前筛选结果中查找主体名称或别名<input data-rel-search type="search" maxlength="180" placeholder="输入主体名称，一键定位" autocomplete="off"></label><div class="relationship-browser-heading" data-rel-list-heading></div><div class="relationship-browser-list" data-rel-list></div><div class="relationship-pager" data-rel-pager></div></aside></div>
  <section class="relationship-evidence" data-rel-evidence aria-live="polite"></section>
 </section>`;
}

function loadRelationshipEngine(){
 if(window.echarts)return Promise.resolve(window.echarts);
 return relationshipEngine ||= new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('quant/echarts.js',import.meta.url);script.onload=()=>resolve(window.echarts);script.onerror=()=>{relationshipEngine=null;reject(Error('图表引擎暂未加载，请点击重试'));};document.head.append(script);});
}

function mountRelationshipChart(host,data,openDoc){
 const life=new AbortController(),model=buildRelationshipModel(data),q=s=>host.querySelector(s);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 // The API snapshot already applies the toolbar's date, country and source scope.
 // Start expanded inside its selected domain; local drill-down never widens it.
 const toolbarTopic=canonicalTopic(document.querySelector('#topic')?.value||'');
 const state={sector:toolbarTopic,entityType:'',subject:''},refinement={entityType:'',relationType:''};
 const primaryLabel=id=>document.querySelector('#'+id)?.selectedOptions?.[0]?.textContent||'';
 const from=document.querySelector('#from')?.value,to=document.querySelector('#to')?.value;
 q('[data-rel-primary-scope]').textContent='一级范围：'+[primaryLabel('topic')||'全部领域',primaryLabel('country')||'全部地域',primaryLabel('source')||'全部来源',from||to?`${from||'不限起始日期'} 至 ${to||'不限结束日期'}`:'全部日期'].join(' · ');
 let chart,engine,network,refinedModel,option,searchTimer,drillTimer,hovered,viewport='',detail=false,searchOpen=false,query='',searchPage=0,searchResults=[],selectedRecords=[],evidencePage=0;
 function evidence(){
  const rows=selectedRecords.slice(evidencePage*4,evidencePage*4+4);
  q('[data-rel-evidence]').innerHTML=rows.length?`<div class="relationship-evidence-heading"><div><small>RELATION / SOURCE EVIDENCE</small><h4>这条关联来自哪里</h4></div><span>${selectedRecords.length} 条保存记录</span></div><div class="relationship-evidence-rows">${rows.map(r=>`<article><p><strong>${esc(model.nodes.get(r.from).name)}</strong><span>${esc(r.type)} →</span><strong>${esc(model.nodes.get(r.to).name)}</strong></p><blockquote>${esc(r.proof[0]?.quoteZh||r.proof[0]?.quote||'原记录未保存摘录，可查看原文核对。')}</blockquote><div class="relationship-evidence-source"><span>${esc(r.document.titleZh||r.document.title||'来源资料')} · ${esc(formatDisplayDate(r.document.publishedAt||'日期未记录'))} · ${esc({verified:'人工确认',confirmed:'已确认',extracted:'系统提取',candidate:'候选记录'}[r.status]||'保存记录')}</span><button data-rel-document="${esc(r.document.id)}">原文与证据 ↗</button></div></article>`).join('')}</div>${selectedRecords.length>4?`<div class="relationship-pager"><button data-rel-evidence-page="-1" ${evidencePage===0?'disabled':''}>上一组</button><span>${evidencePage+1} / ${Math.ceil(selectedRecords.length/4)}</span><button data-rel-evidence-page="1" ${(evidencePage+1)*4>=selectedRecords.length?'disabled':''}>下一组</button></div>`:''}`:'<p class="meta">点击节点放大并展开下一级关联；点击带箭头的连线查看原文证据。分类归属连线与原文关系分别标识。</p>';
 }
 function draw(){
  if(!engine||life.signal.aborted||!host.isConnected)return;
  detail=false;hovered=null;clearTimeout(drillTimer);
  const canvas=q('.relationship-canvas');viewport=canvas.clientWidth+'x'+canvas.clientHeight;
  option=relationshipGraphOption(network,{dark:!document.body.classList.contains('light'),reduced,width:canvas.clientWidth,height:canvas.clientHeight});
  if(!chart){chart=engine.init(q('.relationship-canvas'),null,{renderer:'canvas'});chart.on('click',chartClick);chart.on('mouseover',event=>{hovered=event.dataType==='node'?event.data:null;});chart.on('mouseout',()=>{hovered=null;});chart.on('graphRoam',afterZoom);}
  chart.setOption(option,{replaceMerge:['series']});
  q('[data-rel-status]').hidden=network.nodes.length>0;
  if(!network.nodes.length)q('[data-rel-status]').textContent=refinement.entityType||refinement.relationType?'当前二级条件下没有关联记录，可调整条件或重置二级筛选。':'当前一级范围没有关联记录，请调整上方筛选工具区。';
 }
 function renderSearch(){
  searchResults=query.trim()?searchRelationshipNodes(refinedModel,query).filter(n=>n.kind==='entity'):[...refinedModel.nodes.values()].map(n=>({kind:'entity',entityId:n.id,name:n.name,count:n.relations.length,detail:n.type+' · '+[...n.sectors].map(topicLabel).join(' / ')})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'zh-CN'));
  const pages=Math.max(1,Math.ceil(searchResults.length/12));searchPage=Math.max(0,Math.min(pages-1,searchPage));
  q('[data-rel-list-heading]').textContent=query?`当前筛选内找到 ${searchResults.length} 个主体`:`当前筛选内 ${searchResults.length} 个主体`;
  q('[data-rel-list]').innerHTML=searchResults.slice(searchPage*12,searchPage*12+12).map((n,i)=>`<button class="relationship-browser-item" data-rel-result="${searchPage*12+i}"><span><strong>${esc(n.name)}</strong><small>${esc(n.detail)}</small></span><b>${n.count}<span> ›</span></b></button>`).join('')||'<p class="empty">没有匹配节点，请尝试其他名称或别名。</p>';
  q('[data-rel-pager]').innerHTML=pages>1?`<button data-rel-page="-1" ${searchPage===0?'disabled':''}>上一页</button><span>${searchPage+1} / ${pages}</span><button data-rel-page="1" ${searchPage+1>=pages?'disabled':''}>下一页</button>`:'';
 }
 function toggleSearch(open,{focus=true}={}){
  searchOpen=open;q('[data-rel-search-panel]').hidden=!open;
  q('.relationship-layout').classList.toggle('search-open',open);
  q('[data-rel-search-toggle]').setAttribute('aria-expanded',String(open));
  if(open){renderSearch();if(focus)q('[data-rel-search]').focus({preventScroll:true});}
  else if(focus)q('[data-rel-search-toggle]').focus({preventScroll:true});
 }
 function render(){
  refinedModel=refineRelationshipModel(model,refinement);
  network=relationshipNetwork(refinedModel,state);
  q('[data-rel-stats]').innerHTML=[['主体',network.entityCount],['关系记录',network.relations.length],['来源资料',network.documents]].map(([label,value])=>`<div><strong>${value.toLocaleString('zh-CN')}</strong><span>${label}</span></div>`).join('');
  q('[data-rel-expand]').setAttribute('aria-pressed',String(state.sector===toolbarTopic&&!state.entityType&&!state.subject));
  const types=new Map(),relationTypes=new Map();
  for(const node of model.nodes.values())types.set(node.type,(types.get(node.type)||0)+1);
  for(const row of model.relations)if(!refinement.entityType||model.nodes.get(row.from).type===refinement.entityType||model.nodes.get(row.to).type===refinement.entityType)relationTypes.set(row.type,(relationTypes.get(row.type)||0)+1);
  // Keep a now-empty selection visible instead of silently broadening the result.
  if(refinement.relationType&&!relationTypes.has(refinement.relationType))relationTypes.set(refinement.relationType,0);
  const options=(counts,selected,all)=>`<option value="">${all}</option>`+[...counts].sort(([a],[b])=>a.localeCompare(b,'zh-CN')).map(([value,count])=>`<option value="${esc(value)}" ${selected===value?'selected':''}>${esc(value)} · ${count}</option>`).join('');
  q('[data-rel-entity-type]').innerHTML=options(types,refinement.entityType,'全部主体类型');
  q('[data-rel-relation-type]').innerHTML=options(relationTypes,refinement.relationType,'全部关系类型');
  q('[data-rel-refine-count]').textContent=`一级 ${model.relations.length.toLocaleString('zh-CN')} 条关系 → 二级 ${refinedModel.relations.length.toLocaleString('zh-CN')} 条`;
  q('[data-rel-refine-reset]').disabled=!refinement.entityType&&!refinement.relationType;
  q('[data-rel-breadcrumbs]').innerHTML=`<button data-rel-level="root" ${state.sector===toolbarTopic&&!state.entityType&&!state.subject?'aria-current="page"':''}>${toolbarTopic?'当前筛选范围':'全部领域'}</button>${state.sector?`<span>›</span><button data-rel-level="sector">${esc(topicLabel(state.sector))}</button>`:''}${state.entityType?`<span>›</span><button data-rel-level="type">${esc(state.entityType)}</button>`:''}${network.subject?`<span>›</span><span aria-current="page">${esc(network.subject.name)}</span>`:''}`;
  q('[data-rel-caption]').textContent=network.subject?`${network.subject.name} · 当前筛选下 ${network.relations.length} 条关系记录`:state.entityType?`${state.sector?topicLabel(state.sector)+' / ':''}${state.entityType} · ${network.primaryCount} 个主体及其关联对象`:state.sector?`${topicLabel(state.sector)} · 当前筛选下全部主体与关联关系`:`当前筛选涵盖 ${refinedModel.sectors.size} 个领域 · 已展开全部分类、主体与关联关系`;
  q('[data-rel-legend]').innerHTML=`<span class="relationship-type-keys">${relationshipEntityLegend.filter(t=>network.nodes.some(n=>n.entityType===t.name)).map(t=>`<span><i style="background:${t.color}"></i>${t.name}</span>`).join('')}</span><span>无箭头连线表示分类归属，箭头表示原文记录的关联；虚线关系尚未人工确认。${network.subject?'':'跨领域主体在各自领域分别出现。'}放大图谱可显示更多主体名称，悬停节点查看完整名称。</span>`;
  q('.relationship-canvas').setAttribute('aria-label',q('[data-rel-caption]').textContent+'。点击节点放大下钻。');
  evidence();draw();if(searchOpen)renderSearch();
 }
 function chooseNode(node){
  if(!node)return;
  if(node.kind==='root'){zoom('fit');return;}
  if(node.kind==='entity'){
   if(!refinedModel.nodes.has(node.entityId))return;
   state.subject=node.entityId;state.sector=node.sector||toolbarTopic;state.entityType=refinedModel.nodes.get(node.entityId).type;
  }else{
   state.sector=node.sector||'';state.entityType=node.kind==='type'?node.entityType:'';state.subject='';
  }
  selectedRecords=[];evidencePage=0;
  toggleSearch(false,{focus:false});render();
 }
 function resetNavigation(){
  state.sector=toolbarTopic;state.entityType='';state.subject='';selectedRecords=[];evidencePage=0;query='';searchPage=0;clearTimeout(searchTimer);q('[data-rel-search]').value='';toggleSearch(false,{focus:false});
 }
 function chartClick(event){
  clearTimeout(drillTimer);
  if(event.dataType==='edge'){
   if(event.data.kind==='classification'){chooseNode({kind:event.data.targetKind,sector:event.data.sector,entityType:event.data.entityType,entityId:event.data.entityId});return;}
   const ids=new Set(event.data.recordIds);selectedRecords=network.relations.filter(r=>ids.has(r.id));evidencePage=0;evidence();return;
  }
  chooseNode(event.data);
 }
 function afterZoom(){
  if(!chart)return;
  const zoomLevel=chart.getOption().series[0].zoom||1,nextDetail=zoomLevel>=1.7;
  if(nextDetail!==detail){detail=nextDetail;chart.setOption({series:[{id:'industry-relationship-network',data:option.series[0].data.map(n=>({...n,label:{...n.label,show:n.label.show||detail}}))}]});}
  clearTimeout(drillTimer);
  if(zoomLevel>=2.2&&hovered&&hovered.kind!=='root'&&!hovered.selected){const node=hovered;drillTimer=setTimeout(()=>{if(!life.signal.aborted)chooseNode(node);},160);}
 }
 function zoom(direction){
  if(!chart)return;
  if(direction==='fit'){draw();return;}
  const current=chart.getOption().series[0].zoom||1;
  chart.setOption({series:[{id:'industry-relationship-network',zoom:Math.max(.35,Math.min(12,current*(direction==='in'?1.45:1/1.45)))}]});afterZoom();
 }
 async function start(){
  try{engine=await loadRelationshipEngine();if(!life.signal.aborted&&host.isConnected)draw();}
  catch(error){if(!life.signal.aborted){q('[data-rel-status]').hidden=false;q('[data-rel-status]').innerHTML=esc(error.message)+' <button data-rel-retry>重试</button>';}}
 }
 host.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.relDocument){openDoc(b.dataset.relDocument);return;}
  if(b.hasAttribute('data-rel-retry')){start();return;}
  if(b.hasAttribute('data-rel-refine-reset')){refinement.entityType='';refinement.relationType='';resetNavigation();render();return;}
  if(b.hasAttribute('data-rel-search-toggle')){toggleSearch(!searchOpen);return;}
  if(b.hasAttribute('data-rel-search-close')){toggleSearch(false);return;}
  if(b.hasAttribute('data-rel-result')){chooseNode(searchResults[Number(b.dataset.relResult)]);return;}
  if(b.dataset.relPage){searchPage+=Number(b.dataset.relPage);renderSearch();return;}
  if(b.dataset.relZoom){zoom(b.dataset.relZoom);return;}
  if(b.dataset.relEvidencePage){evidencePage+=Number(b.dataset.relEvidencePage);evidence();return;}
  if(b.hasAttribute('data-rel-expand')||b.dataset.relLevel){
   const level=b.dataset.relLevel;if(level!=='type')state.entityType='';if(level!=='type'&&level!=='sector')state.sector=toolbarTopic;
   state.subject='';selectedRecords=[];evidencePage=0;query='';clearTimeout(searchTimer);q('[data-rel-search]').value='';toggleSearch(false,{focus:false});render();
  }
 },{signal:life.signal});
 host.addEventListener('input',event=>{if(!event.target.matches('[data-rel-search]'))return;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{query=q('[data-rel-search]').value;searchPage=0;renderSearch();},160);},{signal:life.signal});
 host.addEventListener('change',event=>{const key=event.target.matches('[data-rel-entity-type]')?'entityType':event.target.matches('[data-rel-relation-type]')?'relationType':'';if(key){refinement[key]=event.target.value;resetNavigation();render();}},{signal:life.signal});
 host.addEventListener('keydown',event=>{if(event.key==='Escape'&&searchOpen){event.preventDefault();toggleSearch(false);}if(event.target===q('[data-rel-search]')&&event.key==='Enter'){clearTimeout(searchTimer);query=event.target.value;renderSearch();chooseNode(searchResults[0]);}},{signal:life.signal});
 const resize=new ResizeObserver(()=>{chart?.resize();const canvas=q('.relationship-canvas');if(chart&&viewport!==canvas.clientWidth+'x'+canvas.clientHeight)draw();});resize.observe(q('.relationship-canvas'));
 const theme=new MutationObserver(()=>draw());theme.observe(document.body,{attributes:true,attributeFilter:['class']});
 render();start();
 return ()=>{life.abort();clearTimeout(searchTimer);clearTimeout(drillTimer);resize.disconnect();theme.disconnect();chart?.dispose();};
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
