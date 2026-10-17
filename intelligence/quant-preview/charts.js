import {formatDisplayDate} from '../preview.js';
// IEA_UNIFIED_V1
import {officialOption} from './official-charts.js';
﻿export const typeNames={dailyLine:'每日文章趋势',dailyBar:'每日文章柱图',stackedBar:'年度状态堆叠',countryRank:'国家排名',countryTiles:'国家矩形树图',graphCircular:'环形关系图',sourceBar:'来源排名',monthlyBar:'月度文章柱图',monthlyLine:'月度文章趋势',radialTree:'径向树图',shareBar:'占比条形图',valueDot:'数值点图',countryPie:'国家环形图',statusPie:'状态环形图',multiTrend:'多指标趋势',countryBar:'按国家',statusBar:'按开发状态',dot:'对象对比点图',radar:'雷达图',funnel:'漏斗图',candlestick:'K线图',lines:'路径图',calendar:'日历热力图',line:'面积折线图',heatmap:'热力图',boxplot:'箱线图',pie:'环形图',scatter:'散点图',parallel:'平行坐标',bar:'条形 / 柱状图',treemap:'矩形树图',sunburst:'旭日图',tree:'树图',graph:'关系图',sankey:'桑基图',map:'地理地图'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const formatValue=value=>Number.isFinite(Number(value))?new Intl.NumberFormat('zh-CN',{maximumSignificantDigits:6}).format(Number(value)):String(value??'');
const palette=['#287f9c','#41aaa0','#756abb','#d2a258','#86b0c8','#df8579','#9cabb9'];
const count=(rows,key)=>[...rows.reduce((m,r)=>m.set(r[key]||'未提供',(m.get(r[key]||'未提供')||0)+1),new Map())].map(([name,value])=>({name,value}));
const brief=r=>esc(r.period||r.label||r.name||r.subject||r.title||r.project||'')+'<br>'+esc(r.rawValue||r.value||'')+' '+esc(r.unit||'');
function hierarchy(rows){const root={name:'租约登记',children:[]};for(const state of [...new Set(rows.map(r=>r.status))]){const group=rows.filter(r=>r.status===state);root.children.push({name:state,children:[...new Set(group.map(r=>r.authorization))].map(auth=>({name:auth,children:group.filter(r=>r.authorization===auth).map(r=>({name:r.lease+' · '+r.project,value:1}))}))});}return root;}
function quartile(a,q){const p=(a.length-1)*q,b=Math.floor(p);return a[b]+(a[b+1]===undefined?0:(a[b+1]-a[b])*(p-b));}
function rawOptionFor(card,type,sources,dark){
 const rows=card.rows,base={backgroundColor:'transparent',color:palette,animationDuration:350,aria:{enabled:true,description:card.title+'。'+card.content},textStyle:{fontFamily:'Segoe UI, Microsoft YaHei, sans-serif',color:dark?'#b9cee0':'#536e81'},tooltip:{trigger:'item',confine:true},toolbox:{right:5,top:0,feature:{saveAsImage:{title:'保存图表',pixelRatio:2,name:card.title}}},grid:{left:70,right:30,top:35,bottom:65}};
 const official=officialOption(card,type,base);if(official)return official;
 if(['dailyLine','dailyBar','monthlyLine','monthlyBar'].includes(type)){
  const daily=type.startsWith('daily'),counts=new Map();for(const row of rows){const period=String(row.period||'').slice(0,daily?10:7);if(/^\d{4}-\d{2}(?:-\d{2})?$/.test(period))counts.set(period,(counts.get(period)||0)+1);}
  const periods=[...counts.keys()].sort(),filled=[];if(periods.length){const cursor=new Date(periods[0]+(daily?'':'-01')+'T00:00:00Z'),end=periods.at(-1);while(cursor.toISOString().slice(0,daily?10:7)<=end){const p=cursor.toISOString().slice(0,daily?10:7);filled.push([p,counts.get(p)||0]);if(daily)cursor.setUTCDate(cursor.getUTCDate()+1);else cursor.setUTCMonth(cursor.getUTCMonth()+1);}}
  return {...base,tooltip:{trigger:'axis',confine:true,valueFormatter:v=>v+' 篇已采集文章'},xAxis:{type:'category',data:filled.map(r=>r[0])},yAxis:{type:'value',name:'篇已采集文章',min:0,minInterval:1},dataZoom:[{type:'inside'},{type:'slider',bottom:5,height:16}],series:[{type:type.endsWith('Line')?'line':'bar',name:'已采集文章',data:filled.map(r=>r[1]),showSymbol:false,barMaxWidth:25}]};
 }
 if(['countryRank','countryTiles','sourceBar','shareBar','valueDot'].includes(type)){
  const lookup=new Map(sources.map(s=>[s.id,s.name]));
  const groups=type==='sourceBar'?count(rows,'sourceId').map(r=>({...r,name:lookup.get(r.name)||r.name})):rows.map(r=>({name:r.name||r.label,value:r.value}));
  if(type==='countryTiles')return {...base,tooltip:{confine:true,formatter:p=>esc(p.name)+'：'+p.value+' 篇关联报道'},series:[{type:'treemap',data:groups,roam:false,breadcrumb:{show:false},label:{show:true,formatter:'{b}\n{c} 篇'}}]};
  const unit=type==='shareBar'?'%':type==='valueDot'?card.unit:'篇关联报道',sorted=[...groups].sort((a,b)=>a.value-b.value);
  return {...base,grid:{left:155,right:65,top:30,bottom:55},tooltip:{confine:true,formatter:p=>esc(sorted[p.dataIndex].name)+'<br>'+formatValue(sorted[p.dataIndex].value)+' '+esc(unit)},xAxis:{type:'value',name:unit,min:0,...(type==='shareBar'?{max:100}:{})},yAxis:{type:'category',data:sorted.map(r=>r.name),axisLabel:{width:135,overflow:'truncate'}},dataZoom:sorted.length>18?[{type:'inside',yAxisIndex:0,start:Math.max(0,100-1800/sorted.length),end:100}]:[],series:[{type:type==='valueDot'?'scatter':'bar',symbolSize:15,barMaxWidth:25,data:sorted.map((r,i)=>type==='valueDot'?[r.value,i]:r.value),label:{show:type!=='valueDot',position:'right',formatter:p=>formatValue(p.value)+(type==='shareBar'?'%':'')}}]};
 }
 if(card.renderer==='registry-count'){
 const labels={Notice:'公告',Rule:'最终规则','Proposed Rule':'拟议规则',Operational:'运行中','Under Construction':'建设中','Awaiting Construction':'待建设','Planning Permission Granted':'已获规划许可','Planning Application Submitted':'已提交规划申请','Planning Application Withdrawn':'规划申请撤回','Planning Permission Refused':'规划许可被拒',Abandoned:'已放弃',Decommissioned:'已退役',Revised:'已修订'};
 const groups=count(rows,card.groupBy||'status');if(type==='pie'||type==='treemap')return {...base,tooltip:{confine:true,formatter:p=>esc(p.name)+'<br>'+p.value+' '+esc(card.unit)},series:[{type:type==='pie'?'pie':'treemap',radius:['42%','73%'],roam:false,breadcrumb:{show:false},data:groups.map(r=>({...r,name:labels[r.name]||r.name})),label:{show:true,formatter:'{b}\n{c}'}}]};return {...base,grid:{left:170,right:35,top:40,bottom:55},tooltip:{confine:true,formatter:p=>esc(groups[p.dataIndex].name)+'<br>'+p.value+' '+esc(card.unit)},xAxis:{type:'value',name:card.unit,min:0,minInterval:1},yAxis:{type:'category',data:groups.map(r=>labels[r.name]||r.name)},series:[{type:'bar',data:groups.map(r=>r.value),barMaxWidth:28}]};
 }
 if(card.renderer==='metric-comparison'){
 if(type==='boxplot'){const values=rows.map(r=>r.value).sort((a,b)=>a-b),q1=quartile(values,.25),q2=quartile(values,.5),q3=quartile(values,.75),inside=values.filter(v=>v>=q1-1.5*(q3-q1)&&v<=q3+1.5*(q3-q1));return {...base,tooltip:{confine:true,formatter:p=>p.seriesType==='scatter'?esc(rows[p.dataIndex].subject)+'<br>'+p.value[1]+' '+esc(card.unit):'下须 / Q1 / 中位数 / Q3 / 上须<br>'+p.value.slice(-5).join(' / ')+' '+esc(card.unit)},xAxis:{type:'category',data:[rows.length+'个原文对象']},yAxis:{type:'value',name:card.unit,min:values[0]<0?undefined:0},series:[{type:'boxplot',data:[[inside[0],q1,q2,q3,inside.at(-1)]]},{type:'scatter',symbolSize:10,data:rows.map(r=>[0,r.value])}]};}
 return {...base,grid:{left:180,right:50,top:30,bottom:60},tooltip:{confine:true,formatter:p=>brief(rows[p.dataIndex])+'<br>'+esc(rows[p.dataIndex].proof[0]?.quote)},xAxis:{type:'value',name:card.unit,min:rows.some(r=>r.value<0)?undefined:0},yAxis:{type:'category',data:rows.map(r=>r.subject),axisLabel:{formatter:s=>s.length>20?s.slice(0,20)+'…':s}},series:[{type:type==='bar'?'bar':'scatter',barMaxWidth:25,symbolSize:15,data:rows.map((r,i)=>type==='bar'?r.value:[r.value,i])}]};
 }
 if(card.renderer==='hierarchy'){
 const names=new Map(sources.map(s=>[s.id,s.name])),root={name:card.industry,children:[]};
 for(const topic of [...new Set(rows.map(r=>r.industry))]){const selected=rows.filter(r=>r.industry===topic);root.children.push({name:topic,children:[...new Set(selected.map(r=>r.sourceId))].map(id=>({name:names.get(id)||id,children:selected.filter(r=>r.sourceId===id).map(r=>({name:r.title,value:1,url:r.url}))}))});}
 const tooltip={confine:true,formatter:p=>esc(p.name)+'<br>'+ (p.value??'')+' 篇资料'};
 if(type==='sunburst')return {...base,tooltip,series:[{type:'sunburst',data:root.children,radius:['12%','94%'],label:{show:true,rotate:'radial',fontSize:11,overflow:'truncate',width:95,formatter:p=>p.name.length>12?p.name.slice(0,12)+'…':p.name},labelLayout:{hideOverlap:true},levels:[{},{label:{rotate:'tangential'}},{label:{show:true}},{label:{show:true,fontSize:10}}],emphasis:{focus:'ancestor'}}]};
 if(type==='treemap')return {...base,tooltip,series:[{type:'treemap',data:root.children,leafDepth:2,breadcrumb:{show:true},upperLabel:{show:true,height:28},label:{show:true,fontSize:11},itemStyle:{borderColor:'#fff',borderWidth:2,gapWidth:3}}]};
 return {...base,tooltip,series:[{type:'tree',data:[root],left:55,right:180,initialTreeDepth:1,roam:true,expandAndCollapse:true,label:{fontSize:10,position:'left'},leaves:{label:{position:'right',formatter:p=>p.name.length>22?p.name.slice(0,22)+'…':p.name}}}]};
 }
 if(card.renderer==='calendar'){
 const counts=new Map();rows.forEach(r=>counts.set(r.period,(counts.get(r.period)||0)+1));return {...base,tooltip:{confine:true,formatter:p=>esc(p.value[0])+'<br>'+p.value[1]+' 篇已采集文章'},visualMap:{min:0,max:Math.max(...counts.values()),orient:'horizontal',left:'center',bottom:20,text:['较多','较少'],textStyle:{color:dark?'#a7bed0':'#536e81'},inRange:{color:dark?['#294b59','#39818d','#83d6cb']:['#d5eeea','#77bdb7','#267e8d']}},calendar:{range:card.year,left:55,right:25,top:70,cellSize:['auto',23],itemStyle:{color:dark?'#172b3b':'#edf4f7',borderColor:dark?'#223b4c':'#d5e2e9',borderWidth:1},splitLine:{lineStyle:{color:dark?'#3b576a':'#aec4d0',width:1}},dayLabel:{nameMap:'ZH',color:dark?'#a7bed0':'#61778a'},monthLabel:{nameMap:'ZH',color:dark?'#a7bed0':'#61778a'},yearLabel:{show:false}},series:[{type:'heatmap',coordinateSystem:'calendar',data:[...counts]}]};
 }
 if(card.id==='oil-month'||card.renderer==='series'){
 const unit=card.unit;if(type==='line'||type==='bar')return{...base,tooltip:{trigger:'axis',confine:true,valueFormatter:v=>v+' '+unit},xAxis:{type:'category',data:rows.map(r=>r.period),boundaryGap:type==='bar'},yAxis:{type:'value',name:unit,min:rows.some(r=>r.value<0)?undefined:0,splitLine:{lineStyle:{color:'#eaf0f5'}}},dataZoom:[{type:'inside'},{type:'slider',height:16,bottom:5}],series:[{name:card.title,type:type==='bar'?'bar':'line',barMaxWidth:26,data:rows.map(r=>r.value),symbolSize:5,areaStyle:{opacity:.13},lineStyle:{width:2.5}}]};
 const years=[...new Set(rows.map(r=>r.period.slice(0,4)))];if(type==='heatmap')return{...base,grid:{left:60,right:30,top:20,bottom:100},tooltip:{confine:true,formatter:p=>`${years[p.value[1]]}-${String(p.value[0]+1).padStart(2,'0')}<br>${p.value[2]} ${unit}`},xAxis:{type:'category',data:Array.from({length:12},(_,i)=>String(i+1)+'月'),splitArea:{show:true}},yAxis:{type:'category',data:years},visualMap:{min:Math.min(...rows.map(r=>r.value)),max:Math.max(...rows.map(r=>r.value)),orient:'horizontal',left:'center',bottom:5,calculable:true,inRange:{color:['#e5f1f1','#7ebdbb','#247087']}},series:[{type:'heatmap',data:rows.map(r=>[Number(r.period.slice(5))-1,years.indexOf(r.period.slice(0,4)),r.value]),label:{show:true,fontSize:10}}]};
 const boxYears=years.filter(y=>rows.filter(r=>r.period.startsWith(y)).length>=5),boxes=[],out=[];for(const [i,year] of boxYears.entries()){const a=rows.filter(r=>r.period.startsWith(year)).map(r=>r.value).sort((a,b)=>a-b),q1=quartile(a,.25),q2=quartile(a,.5),q3=quartile(a,.75),lower=q1-1.5*(q3-q1),upper=q3+1.5*(q3-q1),valid=a.filter(v=>v>=lower&&v<=upper);boxes.push([valid[0],q1,q2,q3,valid.at(-1)]);for(const v of a.filter(v=>v<lower||v>upper))out.push([i,v]);}
 return{...base,tooltip:{confine:true,formatter:p=>p.seriesType==='scatter'?'离群值：'+p.value[1]+' '+unit:esc(p.name)+'<br>下须 / Q1 / 中位数 / Q3 / 上须<br>'+p.value.slice(-5).map(v=>formatValue(v)).join(' / ')+'<br>'+unit+'；1.5×IQR须线'},xAxis:{type:'category',data:boxYears.map(y=>y+'（'+rows.filter(r=>r.period.startsWith(y)).length+'个月）')},yAxis:{type:'value',name:unit,min:rows.some(r=>r.value<0)?undefined:0},series:[{type:'boxplot',data:boxes},{type:'scatter',data:out}]};
 }
 if(card.id==='fleet'){
 if(type==='parallel')return{...base,parallel:{left:80,right:75,top:50,bottom:45},parallelAxis:[{dim:0,name:'利用率 %',min:0,max:100},{dim:1,name:'收入效率 %',min:0,max:100},{dim:2,name:'日收入\n美元/作业日',min:0}],legend:{bottom:0,data:rows.map(r=>r.period),textStyle:{fontSize:10}},series:rows.map(r=>({name:r.period,type:'parallel',lineStyle:{width:2,opacity:.7},data:[[r.utilization,r.efficiency,r.revenue]]}))};
 if(type==='scatter')return{...base,grid:{left:80,right:30,top:50,bottom:60},tooltip:{confine:true,formatter:p=>esc(formatDisplayDate(p.data.period))+'<br>平台利用率 '+p.value[0]+'%<br>平均日收入 '+p.value[1]+' 美元/作业日<br>收入效率 '+p.data.efficiency+'%'},xAxis:{type:'value',name:'平台利用率 %',nameLocation:'middle',nameGap:30,scale:true},yAxis:{type:'value',name:'美元/作业日（非零起点）',scale:true},series:[{type:'scatter',symbolSize:17,data:rows.map(r=>({value:[r.utilization,r.revenue],period:r.period,efficiency:r.efficiency})),label:{show:true,formatter:p=>p.data.period,position:'top',fontSize:10},itemStyle:{opacity:.8}}]};
 return{...base,tooltip:{trigger:'axis',confine:true,valueFormatter:v=>v+' 美元/作业日'},xAxis:{type:'category',data:rows.map(r=>r.period)},yAxis:{type:'value',name:'美元/作业日',min:0},series:[{type:'bar',data:rows.map(r=>r.revenue),barMaxWidth:34,itemStyle:{borderRadius:[5,5,0,0]}}]};
 }
 if(type==='sankey'){const lookup=new Map(sources.map(s=>[s.id,s.name])),pairs=new Map();for(const r of rows){const key=r.sourceId+'|'+r.industry;pairs.set(key,(pairs.get(key)||0)+1);}const links=[...pairs].map(([k,value])=>{const [id,topic]=k.split('|');return{source:lookup.get(id)||id,target:'领域 · '+topic,value};});return{...base,tooltip:{confine:true,formatter:p=>esc(p.data.source?`${p.data.source} → ${p.data.target}：${p.data.value} 篇`:p.name)},series:[{type:'sankey',left:15,right:160,top:15,bottom:15,data:[...new Set(links.flatMap(l=>[l.source,l.target]))].map(name=>({name})),links,nodeWidth:12,nodeGap:12,lineStyle:{color:'source',opacity:.18},label:{fontSize:10},emphasis:{focus:'adjacency'}}]};}
 if(card.id==='leases'){
 const root=hierarchy(rows);if(type==='pie')return{...base,tooltip:{confine:true,formatter:p=>esc(p.name)+'：'+p.value+' 条租约（'+p.percent+'%）'},legend:{bottom:0},series:[{type:'pie',radius:['43%','68%'],center:['50%','45%'],data:count(rows,'status'),label:{formatter:'{b}\n{c} 条',fontSize:11}}]};
 if(type==='treemap')return{...base,tooltip:{confine:true,formatter:p=>esc(p.name)+'<br>'+p.value+' 条租约'},series:[{type:'treemap',data:root.children,leafDepth:2,roam:false,breadcrumb:{show:true},label:{show:true,fontSize:10},upperLabel:{show:true,height:25},itemStyle:{borderColor:'#fff',borderWidth:2,gapWidth:2},levels:[{itemStyle:{gapWidth:5}},{colorSaturation:[.3,.7]}]}]};
 if(type==='sunburst')return{...base,tooltip:{confine:true,formatter:p=>esc(p.name)+'<br>'+p.value+' 条租约'},series:[{type:'sunburst',data:root.children,radius:['8%','92%'],sort:null,label:{show:true,fontSize:10,overflow:'truncate',width:80,formatter:p=>p.name.length>10?p.name.slice(0,10)+'…':p.name},labelLayout:{hideOverlap:true},levels:[{},{label:{show:true,rotate:0}},{label:{show:true}},{label:{show:true}}],emphasis:{focus:'ancestor'}}]};
 return{...base,tooltip:{confine:true,formatter:p=>esc(p.name)},series:[{type:'tree',data:[root],left:15,right:180,top:15,bottom:15,initialTreeDepth:2,symbolSize:6,label:{position:'left',fontSize:10},leaves:{label:{position:'right'}},expandAndCollapse:true,roam:true}]};
 }
 if(card.id==='lease-year'&&type==='stackedBar'){
 const years=[...new Set(rows.map(r=>r.effectiveYear))].sort(),statuses=[...new Set(rows.map(r=>r.status))];
 return {...base,tooltip:{trigger:'axis',confine:true,valueFormatter:v=>v+' 条租约'},legend:{type:'scroll',bottom:0},xAxis:{type:'category',data:years},yAxis:{type:'value',name:'条租约',min:0,minInterval:1},series:statuses.map(status=>({name:status,type:'bar',stack:'leases',barMaxWidth:30,data:years.map(year=>rows.filter(r=>r.effectiveYear===year&&r.status===status).length)}))};
 }
 if(card.id==='lease-year'){const years=[...new Set(rows.map(r=>r.effectiveYear))].sort(),statuses=[...new Set(rows.map(r=>r.status))],values=[];for(const [i,y]of years.entries())for(const[j,s]of statuses.entries()){const n=rows.filter(r=>r.effectiveYear===y&&r.status===s).length;if(n)values.push([i,j,n]);}return{...base,grid:{left:105,right:20,bottom:100,top:20},tooltip:{confine:true,formatter:p=>years[p.value[0]]+'年生效 · '+esc(statuses[p.value[1]])+'<br>'+p.value[2]+' 条租约'},xAxis:{type:'category',data:years,axisLabel:{rotate:40}},yAxis:{type:'category',data:statuses},visualMap:{min:1,max:Math.max(...values.map(v=>v[2])),orient:'horizontal',left:'center',bottom:0,inRange:{color:['#daf0ef','#287f9c']}},series:[{type:'heatmap',data:values,label:{show:true}}]};}
 if(type==='graph'||type==='graphCircular'){const names=[...new Set(rows.flatMap(r=>[r.fromName,r.toName]))];return{...base,tooltip:{confine:true,formatter:p=>p.dataType==='edge'?esc(p.data.relation)+'<br>'+esc(p.data.proof?.slice(0,220)):esc(p.name)},series:[{type:'graph',layout:type==='graphCircular'?'circular':'force',circular:{rotateLabel:true},roam:true,data:names.map(name=>({name,symbolSize:18})),links:rows.map(r=>({source:r.fromName,target:r.toName,relation:r.type,proof:r.proof[0]?.quote})),force:{repulsion:220,edgeLength:[75,130]},edgeSymbol:['none','arrow'],edgeSymbolSize:6,label:{show:true,position:'right',formatter:p=>p.name.length>20?p.name.slice(0,20)+'…':p.name,fontSize:10},lineStyle:{color:'#78a5b4',curveness:.1},emphasis:{focus:'adjacency'}}]};}
 if(type==='map')return{...base,tooltip:{confine:true,formatter:p=>{const r=rows.find(r=>r.code===p.name);return r?esc(r.name)+'：'+r.value+' 篇报道（非产量）':'暂无关联报道';}},visualMap:{min:0,max:Math.max(...rows.map(r=>r.value)),left:0,bottom:0,inRange:{color:['#e7f0f3','#267a9a']},text:['报道篇数','']},series:[{type:'map',map:'ocean-world',roam:true,selectedMode:false,data:rows.map(r=>({name:r.code,value:r.value})),label:{show:false},itemStyle:{areaColor:'#e7eff3',borderColor:'#d2dfe5'},emphasis:{itemStyle:{areaColor:'#8dd0c5'},label:{show:false}}}]};
 if(card.id==='reports-宏观政策'){const ids=[...new Set(rows.map(r=>r.sourceId))],lookup=new Map(sources.map(s=>[s.id,s.name]));return{...base,grid:{left:100,right:25,top:25,bottom:65},tooltip:{confine:true,formatter:p=>esc(p.data.title)+'<br>报道日期：'+esc(formatDisplayDate(p.data.period))},xAxis:{type:'time',axisLabel:{formatter:v=>new Date(v).toISOString().slice(0,10),rotate:20}},yAxis:{type:'category',data:ids.map(id=>lookup.get(id)||id),axisLabel:{fontSize:10}},series:[{type:'scatter',symbolSize:13,data:rows.filter(r=>r.period).map(r=>({...r,value:[Date.parse(r.period.includes('T')?r.period:r.period+'T00:00:00Z'),ids.indexOf(r.sourceId)]}))}]};}
 if(type==='tree'||type==='radialTree')return{...base,tooltip:{confine:true,formatter:p=>esc(p.name)},series:[{type:'tree',layout:type==='radialTree'?'radial':'orthogonal',data:[{name:'多能融合',children:rows.map(r=>({name:r.title,children:r.children}))}],left:40,right:180,top:20,bottom:20,initialTreeDepth:2,label:{position:'left',fontSize:11,formatter:p=>p.name.length>20?p.name.slice(0,20)+'…':p.name},leaves:{label:{position:'right'}},roam:true,expandAndCollapse:true}]};
 if(type==='pie')return{...base,tooltip:{confine:true,formatter:p=>esc(p.name)+'<br>'+p.value+'%'},legend:{bottom:0,type:'scroll',textStyle:{fontSize:10}},series:[{type:'pie',radius:['40%','66%'],center:['50%','44%'],data:rows.map(r=>({name:r.label,value:r.value})),label:{formatter:'{c}%',fontSize:13}}]};
 return{...base,grid:{left:150,right:50,top:30,bottom:45},tooltip:{confine:true,formatter:p=>brief(rows[p.dataIndex])+'<br>性质：'+esc(rows[p.dataIndex].nature)},xAxis:{type:'value',name:card.unit,min:0,axisLabel:{formatter:v=>v>=1e6?v/1e6+'百万':v}},yAxis:{type:'category',data:rows.map(r=>r.label||r.name),axisLabel:{fontSize:11}},series:[{type:'bar',barMaxWidth:38,data:rows.map(r=>r.value),label:{show:true,position:'right',formatter:p=>(p.value/1e6)+'百万'},itemStyle:{borderRadius:[0,6,6,0]}}]};
}
export async function registerWorld(){const shapes=await(await fetch(new URL('world.json',import.meta.url))).json();window.echarts.registerMap('ocean-world',{svg:`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="430" viewBox="0 0 900 430">${shapes.map(c=>`<path name="${esc(c.code)}" d="${esc(c.path)}" fill="#e7eff3" stroke="#cbdbe4" stroke-width="0.4"/>`).join('')}</svg>`});}

const vividDark=['#38e8d2','#b594ff','#ffcb7b','#6acfff','#ff8cb2','#8be0a1','#8996ff'];
const vividLight=['#087f88','#8d55cd','#b77d14','#2785bb','#cb557e','#398f6a','#5365d8'];
export function chartColorIndex(card){
 const key=card.seriesId||card.id||card.title||'';
 const fixed={'transocean-utilization':0,'transocean-revenue-efficiency':1,'transocean-daily-revenue':2,fleet:0};
 if(Object.hasOwn(fixed,key))return fixed[key];
 // Names keep cached catalogs compatible; IDs keep colors stable after a rename.
 if(!card.seriesId&&/全船队.*平台利用率/.test(card.title))return 0;
 if(!card.seriesId&&/全船队.*收入效率/.test(card.title))return 1;
 if(!card.seriesId&&/全船队.*日收入/.test(card.title))return 2;
 let hash=2166136261;for(const c of key)hash=Math.imul(hash^c.charCodeAt(0),16777619);return (hash>>>0)%vividDark.length;
}
const mix=(a,b,ratio)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-ratio)+parseInt(b.slice(i,i+2),16)*ratio).toString(16).padStart(2,'0')).join('');
const alpha=(hex,opacity)=>{const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${n>>8&255},${n&255},${opacity})`;};
const gradient=(color,horizontal=false)=>({type:'linear',x:0,y:0,x2:horizontal?1:0,y2:horizontal?0:1,colorStops:[{offset:0,color:alpha(color,.2)},{offset:1,color}]});
const areaGradient=color=>({type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:alpha(color,.35)},{offset:1,color:alpha(color,.015)}]});
const orb=color=>({type:'radial',x:.35,y:.3,r:.8,colorStops:[{offset:0,color:'#fff'},{offset:.2,color:alpha(color,.98)},{offset:1,color:alpha(color,.35)}]});

export function styleOption(input,dark=false,context={}){
 const palette=dark?vividDark:vividLight,offset=context.colorIndex||0,colors=[...palette.slice(offset),...palette.slice(0,offset)],ink=dark?'#d9edf8':'#29465d',muted=dark?'#8aa7bc':'#6b8294',panel=dark?'#0c1c2d':'#fff',line=dark?'rgba(114,168,196,.13)':'rgba(87,125,151,.13)';
 const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
 const option={...input,color:colors,animation:input.animation!==false&&!reduced,animationDuration:700,animationDurationUpdate:420,animationEasing:'cubicOut',textStyle:{...input.textStyle,color:muted,fontFamily:'Segoe UI, Microsoft YaHei, sans-serif'},tooltip:{...input.tooltip,backgroundColor:dark?'rgba(9,24,40,.96)':'rgba(255,255,255,.97)',borderColor:alpha(colors[0],.35),borderWidth:1,padding:[12,15],textStyle:{color:ink,fontSize:12},extraCssText:'border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.22);',axisPointer:{type:'line',lineStyle:{color:alpha(colors[0],.55),type:'dashed'},label:{backgroundColor:colors[0],color:dark?'#0c1c2d':'#fff'}}}};
 const axes=(value,horizontal)=>{const style=axis=>({...axis,nameTextStyle:{...axis.nameTextStyle,color:muted,fontSize:10,padding:4},axisLine:{...axis.axisLine,show:axis.type==='category',lineStyle:{color:line}},axisTick:{show:false},axisLabel:{...axis.axisLabel,color:muted,fontSize:10,hideOverlap:true,...(context.width<520&&axis.type==='category'&&!horizontal?{width:85,overflow:'truncate'}:{})},splitLine:{...axis.splitLine,lineStyle:{color:line,type:'dashed'}},...(axis.splitArea?{splitArea:{...axis.splitArea,areaStyle:{color:[alpha(colors[0],.025),'transparent']}}}:{})});return Array.isArray(value)?value.map(style):value?style(value):value;};
 option.xAxis=axes(input.xAxis,true);option.yAxis=axes(input.yAxis,false);
 if(input.grid&&!Array.isArray(input.grid)&&context.width<520){option.grid={...input.grid,left:Math.min(typeof input.grid.left==='number'?input.grid.left:60,105),right:Math.max(typeof input.grid.right==='number'?input.grid.right:20,28)};}
 if(input.legend)option.legend={...input.legend,itemWidth:12,itemHeight:5,icon:'roundRect',itemGap:16,textStyle:{...input.legend.textStyle,color:muted,fontSize:10},inactiveColor:dark?'#344b60':'#bdcbd6',pageTextStyle:{color:muted}};
 if(input.toolbox)option.toolbox={...input.toolbox,iconStyle:{borderColor:muted},emphasis:{iconStyle:{borderColor:colors[0]}}};
 if(input.dataZoom)option.dataZoom=input.dataZoom.map(z=>({...z,borderColor:'transparent',backgroundColor:alpha(colors[0],.04),fillerColor:alpha(colors[0],.13),dataBackground:{lineStyle:{color:alpha(colors[0],.4)},areaStyle:{color:alpha(colors[0],.08)}},selectedDataBackground:{lineStyle:{color:colors[0]},areaStyle:{color:alpha(colors[0],.15)}},handleStyle:{color:colors[0],borderColor:panel},textStyle:{color:muted,fontSize:10}}));
 if(input.visualMap){const vm=v=>({...v,itemHeight:110,itemWidth:9,textStyle:{...v.textStyle,color:muted,fontSize:10},inRange:{...v.inRange,color:[0,.22,.48,.73,1].map(ratio=>mix(dark?'#122033':'#f0f5fb',colors[0],ratio))}});option.visualMap=Array.isArray(input.visualMap)?input.visualMap.map(vm):vm(input.visualMap);}
 if(input.calendar)option.calendar={...input.calendar,itemStyle:{...input.calendar.itemStyle,color:panel,borderColor:dark?'#102539':'#f1f6fa',borderWidth:3},splitLine:{lineStyle:{color:line,width:1}},dayLabel:{...input.calendar.dayLabel,color:muted},monthLabel:{...input.calendar.monthLabel,color:muted}};
 if(input.parallelAxis)option.parallelAxis=input.parallelAxis.map(a=>({...a,nameTextStyle:{color:ink,fontSize:11},axisLabel:{color:muted,fontSize:10},axisLine:{lineStyle:{color:line}},axisTick:{show:false}}));
 option.series=(input.series||[]).map((original,index)=>{
  const s={...original},color=colors[index%colors.length];
  if(s.type==='line'){
   s.lineStyle={...s.lineStyle,color,width:2.8,shadowBlur:dark?9:0,shadowColor:alpha(color,.55)};
   s.itemStyle={...s.itemStyle,color,borderColor:panel,borderWidth:2};s.symbol='circle';s.symbolSize=6;s.showSymbol=(s.data?.length||0)<=9;
   s.areaStyle={...s.areaStyle,color:areaGradient(color),opacity:1};s.emphasis={...s.emphasis,focus:'series',scale:1.7};
  }
  if(s.type==='bar'){
   const y=Array.isArray(input.yAxis)?input.yAxis[s.yAxisIndex||0]:input.yAxis,horizontal=y?.type==='category';
   s.barMaxWidth=Math.min(s.barMaxWidth||26,26);s.showBackground=true;s.backgroundStyle={color:alpha(color,dark?0.035:0.045),borderRadius:5};
   s.itemStyle={...s.itemStyle,color:gradient(color,horizontal),borderRadius:horizontal?[0,7,7,0]:[7,7,0,0],shadowBlur:dark?8:0,shadowColor:alpha(color,.2)};
   s.label={...s.label,color:ink,fontSize:11,fontFamily:'SFMono-Regular, Consolas, monospace',formatter:p=>formatValue(Array.isArray(p.value)?p.value.at(-1):p.value)};
   s.emphasis={...s.emphasis,itemStyle:{shadowBlur:16,shadowColor:alpha(color,.5)}};
  }
  if(s.type==='scatter'){
   s.itemStyle={...s.itemStyle,color:orb(color),opacity:.95,shadowBlur:dark?14:4,shadowColor:alpha(color,.65),borderColor:alpha(color,.7),borderWidth:1};
   s.label={...s.label,color:ink,fontSize:10,distance:9};s.emphasis={...s.emphasis,scale:1.5,itemStyle:{shadowBlur:24,shadowColor:color}};
   if(context.cardId==='fleet'&&!reduced){s.type='effectScatter';s.showEffectOn='emphasis';s.rippleEffect={scale:2.6,brushType:'stroke',period:3.5};}
  }
  if(s.type==='heatmap'){
   s.itemStyle={...s.itemStyle,borderWidth:s.coordinateSystem==='calendar'?2:3,borderColor:panel};
   s.emphasis={...s.emphasis,itemStyle:{borderColor:colors[0],borderWidth:1,shadowBlur:12,shadowColor:alpha(colors[0],.6)}};
   s.label={...s.label,color:dark?'#e7f5ff':'#29465d'};
   if(s.label.show&&!s.label.formatter){const maximum=Math.max(...s.data.map(d=>(Array.isArray(d)?d:d.value).at(-1)),1);s.label.formatter=p=>`{${dark&&p.value.at(-1)/maximum>.68?'high':'low'}|${formatValue(p.value.at(-1))}}`;s.label.rich={high:{color:'#083d44',fontSize:10,fontWeight:600},low:{color:dark?'#d9edf8':'#29465d',fontSize:10}};}
  }
  if(s.type==='pie'){
   s.itemStyle={...s.itemStyle,borderRadius:7,borderWidth:3,borderColor:panel,shadowBlur:dark?9:0,shadowColor:alpha(colors[0],.2)};
   s.label={...s.label,color:ink};s.labelLine={...s.labelLine,lineStyle:{color:alpha(colors[0],.45)}};
   s.emphasis={...s.emphasis,scaleSize:9,itemStyle:{shadowBlur:24,shadowColor:alpha(colors[0],.4)}};
  }
  if(s.type==='sunburst'){
   const total=context.total||1,leafTotal=node=>node.children?.length?node.children.reduce((n,c)=>n+leafTotal(c),0):Number(node.value)||0;
   s.data=s.data.map(node=>({...node,children:node.children?.map(child=>{const {children,...rest}=child;return {...rest,value:leafTotal(child)};})}));
   s.radius=['26%','88%'];s.nodeClick=false;
   s.itemStyle={...s.itemStyle,borderColor:panel,borderWidth:3,borderRadius:5};
   s.label={...s.label,color:dark?'#092b3b':'#fff',width:85,overflow:'truncate',minAngle:14,formatter:p=>p.value/total<.03?'':p.name.length>11?p.name.slice(0,11)+'…':p.name};
   s.levels=[{},{r0:'26%',r:'52%',label:{rotate:'tangential',fontSize:12,minAngle:18,formatter:p=>p.value/total<.025?'':p.name}},{r0:'53%',r:'88%',label:{rotate:'radial',fontSize:10,minAngle:14,formatter:p=>p.value/total<.03?'':p.name.length>11?p.name.slice(0,11)+'…':p.name}}];
   s.emphasis={...s.emphasis,itemStyle:{shadowBlur:16,shadowColor:alpha(colors[0],.4)},label:{show:true}};
   if(context.total)option.graphic=[...(Array.isArray(option.graphic)?option.graphic:[]),{type:'text',left:'center',top:'43%',silent:true,style:{text:formatValue(context.total),fill:ink,fontSize:28,fontWeight:600,fontFamily:'SFMono-Regular, Consolas, monospace'}},{type:'text',left:'center',top:'52%',silent:true,style:{text:context.cardId==='leases'?'条登记':'篇资料',fill:muted,fontSize:11}}];
  }
  if(s.type==='treemap'){
   s.itemStyle={...s.itemStyle,borderColor:panel,borderWidth:3,gapWidth:4};s.label={...s.label,color:dark?'#effaff':'#fff'};
   s.upperLabel={...s.upperLabel,color:ink,fontSize:11};
   if(s.levels)s.levels=s.levels.map(l=>({...l,itemStyle:{...l.itemStyle,borderColor:panel,gapWidth:4}}));
   s.breadcrumb={...s.breadcrumb,itemStyle:{color:panel,borderColor:line},emphasis:{itemStyle:{color:alpha(colors[0],.2)}},textStyle:{color:muted}};
  }
  if(s.type==='graph'){
   s.data=s.data.map((node,i)=>({...node,itemStyle:{...node.itemStyle,color:orb(colors[i%colors.length]),shadowBlur:dark?15:3,shadowColor:alpha(colors[i%colors.length],.5),borderColor:colors[i%colors.length],borderWidth:1.5}}));
   s.lineStyle={...s.lineStyle,color:alpha(colors[0],.45),width:1.5,curveness:.15};s.label={...s.label,color:ink};s.emphasis={...s.emphasis,lineStyle:{width:3,opacity:1},itemStyle:{shadowBlur:24}};
  }
  if(s.type==='tree'){
   s.symbol='circle';s.symbolSize=8;s.itemStyle={color:colors[0],borderColor:alpha(colors[0],.3),borderWidth:5};s.lineStyle={color:alpha(colors[0],.4),width:1.5,curveness:.5};s.label={...s.label,color:ink};s.leaves={...s.leaves,label:{...s.leaves?.label,color:muted}};
  }
  if(s.type==='sankey'){
   s.nodeWidth=14;s.lineStyle={...s.lineStyle,color:'source',opacity:.33,curveness:.55};s.itemStyle={...s.itemStyle,borderWidth:0,borderRadius:4};s.label={...s.label,color:ink};s.emphasis={...s.emphasis,lineStyle:{opacity:.65}};
  }
  if(s.type==='parallel')s.lineStyle={...s.lineStyle,color,width:2.4,opacity:.85};
  if(s.type==='boxplot')s.itemStyle={color:alpha(color,.2),borderColor:color,borderWidth:1.5};
  if(s.type==='map'){s.itemStyle={...s.itemStyle,areaColor:dark?'#112d44':'#e3eef5',borderColor:dark?'#36617a':'#a7c0d1',borderWidth:.6};s.emphasis={...s.emphasis,itemStyle:{areaColor:dark?'#225c72':'#9cded6',borderColor:colors[0],borderWidth:1.2},label:{show:false}};}
  return s;
 });
 return option;
}

function fleetTrends(card,dark,width){
 const rows=[...card.rows].sort((a,b)=>a.period.localeCompare(b.period)),latest=rows.at(-1),compact=width<700,colors=dark?vividDark:vividLight;
 const specs=[{key:'utilization',name:'平台利用率',unit:'%',max:100},{key:'efficiency',name:'收入效率',unit:'%',max:100},{key:'revenue',name:'平均日收入',unit:'美元/作业日'}];
 const title=[],grid=[],xAxis=[],yAxis=[],series=[];
 specs.forEach((s,i)=>{
  const left=compact?18:`${i*33.333+4}%`,top=compact?i*146+8:22;
  title.push({text:formatValue(latest[s.key])+(s.unit==='%'?'%':''),subtext:s.name+(s.unit==='%'?'':' · '+s.unit),left,top,textStyle:{color:colors[i],fontSize:compact?25:34,fontWeight:600,fontFamily:'SFMono-Regular, Consolas, monospace'},subtextStyle:{color:dark?'#8aa7bc':'#6b8294',fontSize:11},itemGap:5});
  grid.push(compact?{left:58,right:32,top:i*146+75,height:53}:{left:`${i*33.333+4}%`,right:`${(2-i)*33.333+4}%`,top:135,bottom:48});
  xAxis.push({type:'category',gridIndex:i,data:rows.map(r=>r.period),boundaryGap:false,axisLabel:{fontSize:9,interval:Math.max(0,Math.ceil(rows.length/(compact?4:3))-1)}});
  yAxis.push({type:'value',gridIndex:i,min:0,max:s.max,splitNumber:2,axisLabel:{formatter:v=>s.unit==='%'?v+'%':v>=1000?formatValue(v/1000)+'k':formatValue(v)}});
  series.push({name:s.name,type:'line',xAxisIndex:i,yAxisIndex:i,data:rows.map(r=>r[s.key]),showSymbol:true,symbolSize:5});
 });
 return {backgroundColor:'transparent',aria:{enabled:true,description:card.title+'；三个指标分别展示，百分比与日收入使用各自坐标。'},title,grid,xAxis,yAxis,axisPointer:{link:[{xAxisIndex:'all'}]},tooltip:{trigger:'axis',confine:true,formatter:params=>{const list=Array.isArray(params)?params:[params],period=list[0]?.axisValue;const row=rows.find(r=>r.period===period);return row?esc(period)+'<br>'+specs.map((s,i)=>`<span style="color:${colors[i]}">●</span> ${s.name}　${formatValue(row[s.key])} ${s.unit}`).join('<br>'):'';}},toolbox:{right:0,top:0,feature:{saveAsImage:{title:'保存图表',pixelRatio:2,name:card.title}}},series};
}

export function optionFor(card,type,sources,dark=globalThis.document?.documentElement?.dataset.theme==='dark',width=1100){
 const option=type==='multiTrend'&&card.id==='fleet'?fleetTrends(card,dark,width):rawOptionFor(card,type,sources,dark);
 return styleOption(option,dark,{cardId:card.id,width,total:card.rows.length,colorIndex:card.id==='fleet'&&type==='bar'?2:chartColorIndex(card)});
}
