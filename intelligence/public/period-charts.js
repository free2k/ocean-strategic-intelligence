import {escapeHtml as esc} from './preview.js';

const palette=['#78cfc3','#a997ee','#7db9dd','#e0b874','#d998af','#82b995'];
export function periodChartData(job){
 const days=[];
 for(let t=Date.parse(job.range.from+'T00:00:00Z');t<=Date.parse(job.range.to+'T00:00:00Z');t+=86400000)days.push(new Date(t).toISOString().slice(0,10));
 const domains=job.domains.map(d=>({name:d.name,topic:d.topic,count:0,daily:days.map(()=>0),sources:new Map()})),sources=new Map(),hours=new Map();
 for(const entry of job.documents||[]){
  const domain=domains.find(d=>d.topic===entry.classification?.primary);
  if(!domain)continue;
  const source=entry.sourceName||'未记录来源',date=new Date(Date.parse(entry.body.publishedAt)+8*3600000);
  if(!Number.isFinite(+date))continue;
  const day=date.toISOString().slice(0,10),index=days.indexOf(day);
  if(index<0)continue;
  domain.count++;domain.daily[index]++;
  domain.sources.set(source,(domain.sources.get(source)||0)+1);
  sources.set(source,(sources.get(source)||0)+1);
  const key=index+','+date.getUTCHours();hours.set(key,(hours.get(key)||0)+1);
 }
 return {days,domains,sources:[...sources].sort((a,b)=>b[1]-a[1]),hours:[...hours].map(([key,n])=>[...key.split(',').map(Number),n]),total:domains.reduce((n,d)=>n+d.count,0)};
}
let engine;
function loadEngine(){return window.echarts?Promise.resolve(window.echarts):(engine||=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='quant/echarts.js';s.onload=()=>resolve(window.echarts);s.onerror=()=>{engine=null;s.remove();reject(Error('图表加载失败，请刷新重试'));};document.head.append(s);}));}
export function mountPeriodCharts(host,job){
 let disposed=false,charts=[],resize;
 const data=periodChartData(job);
 if(!data.total){host.innerHTML='';return()=>{};}
 const cards=[['pie','六领域文章占比','每篇按主行业计一次。'],['flow','发布来源 → 六领域','展示文章最多的 8 个来源，其余合并；线宽表示文章篇数。'],['daily','各领域每日发布分布','按原文发布日期统计，堆叠高度表示当天选用篇数。'],['heat','发布频率热力图','北京时间：横轴日期，纵轴小时；0 表示本期没有选用该时段文章。'],['tree','领域与来源矩形树图','矩形面积表示本次选用文章数，点击领域可下钻查看来源。'],['sources','来源文章数量','展示前 12 个来源，其余合并；不代表来源影响力排名。']];
 host.innerHTML=`<section class="panel"><h2>本期文章图表</h2><p>${esc(job.range.from)} 至 ${esc(job.range.to)} · 本次已保存的 ${data.total} 篇正文文章。以下各图使用同一份生成输入；与上方含无正文资料的“纳入行业分布”口径不同。</p><div class="period-chart-grid">${cards.map(([id,title,note])=>`<section><h3>${title}</h3><div class="period-chart" data-period-chart="${id}" role="img" aria-label="${title}"></div><p class="muted">${note}</p></section>`).join('')}</div><p class="muted">文章分布反映本期资料覆盖，不代表产业规模；每次切换成果均按该次保存的数据重新绘制。</p></section>`;
 loadEngine().then(echarts=>{
  if(disposed)return;
  const text=document.body.classList.contains('light')?'#335269':'#b9cddd';
  function draw(id,option){const el=host.querySelector(`[data-period-chart="${id}"]`),chart=echarts.init(el);chart.setOption({backgroundColor:'transparent',color:palette,textStyle:{color:text},tooltip:{trigger:'item',confine:true,renderMode:'richText'},...option});charts.push(chart);}
  const axes={axisLabel:{color:text},axisLine:{lineStyle:{color:'#526577'}},splitLine:{lineStyle:{color:'#263b49'}}};
  draw('pie',{legend:{bottom:0,textStyle:{color:text}},series:[{type:'pie',radius:['35%','62%'],center:['50%','43%'],label:{color:text,formatter:'{b}\n{c} 篇 ({d}%)'},data:data.domains.map(d=>({name:d.name,value:d.count}))}]});
  const top=new Set(data.sources.slice(0,8).map(([name])=>name)),sourceNodes=[...top];if(data.sources.length>8)sourceNodes.push('其他来源');
  const links=[];data.domains.forEach(d=>{const grouped=new Map();for(const [source,count] of d.sources){const name=top.has(source)?source:'其他来源';grouped.set(name,(grouped.get(name)||0)+count);}for(const [source,value] of grouped)links.push({source:'来源：'+source,target:'领域：'+d.name,value});});
  draw('flow',{series:[{type:'sankey',left:10,right:110,top:15,bottom:15,nodeGap:16,draggable:false,label:{color:text,fontSize:11,formatter:p=>p.name.replace(/^(来源|领域)：/,'')},lineStyle:{color:'gradient',opacity:.3},data:[...sourceNodes.map(name=>({name:'来源：'+name})),...data.domains.filter(d=>d.count).map(d=>({name:'领域：'+d.name}))],links}]});
  draw('daily',{legend:{bottom:0,textStyle:{color:text}},tooltip:{trigger:'axis',confine:true,renderMode:'richText'},grid:{left:45,right:20,top:20,bottom:80},xAxis:{...axes,type:'category',data:data.days},yAxis:{...axes,type:'value',minInterval:1},series:data.domains.map(d=>({name:d.name,type:'bar',stack:'articles',data:d.daily}))});
  draw('heat',{grid:{left:45,right:15,top:15,bottom:80},xAxis:{...axes,type:'category',data:data.days},yAxis:{...axes,type:'category',data:Array.from({length:24},(_,i)=>String(i).padStart(2,'0')+'时')},visualMap:{min:0,max:Math.max(1,...data.hours.map(h=>h[2])),orient:'horizontal',left:'center',bottom:0,calculable:true,textStyle:{color:text},inRange:{color:['#142737','#258d9b','#86dfcb']}},series:[{type:'heatmap',data:data.days.flatMap((_,day)=>Array.from({length:24},(_,hour)=>[day,hour,data.hours.find(h=>h[0]===day&&h[1]===hour)?.[2]||0]))}]});
  draw('tree',{series:[{type:'treemap',roam:false,leafDepth:1,breadcrumb:{show:true},label:{formatter:'{b}\n{c} 篇'},upperLabel:{show:true,height:25},data:data.domains.filter(d=>d.count).map(d=>({name:d.name,value:d.count,children:[...d.sources].map(([name,value])=>({name,value}))}))}]});
  const ranked=data.sources.slice(0,12);if(data.sources.length>12)ranked.push(['其余来源',data.sources.slice(12).reduce((n,s)=>n+s[1],0)]);
  draw('sources',{grid:{left:135,right:35,top:10,bottom:25},xAxis:{...axes,type:'value',minInterval:1},yAxis:{...axes,type:'category',inverse:true,data:ranked.map(s=>s[0]),axisLabel:{color:text,width:120,overflow:'truncate'}},series:[{type:'bar',data:ranked.map(s=>s[1]),label:{show:true,position:'right',color:text}}]});
  resize=new ResizeObserver(()=>charts.forEach(c=>c.resize()));resize.observe(host);
 }).catch(e=>{if(!disposed)host.innerHTML=`<p role="status">${esc(e.message)}</p>`;});
 return()=>{disposed=true;resize?.disconnect();charts.forEach(c=>c.dispose());};
}
