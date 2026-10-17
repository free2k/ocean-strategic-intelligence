const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>new Intl.NumberFormat('zh-CN',{maximumSignificantDigits:6}).format(v);
export function officialOption(card,type,base){
 const rows=card.cohorts?.[card.selectedCohort||0]?.rows||card.rows;
 if(card.renderer==='official-capacity'){
  const selected=[...rows].sort((a,b)=>b.value-a.value).slice(0,15).reverse();
  return {...base,grid:{left:160,right:55,top:40,bottom:55},tooltip:{confine:true,formatter:p=>{const r=selected[p.dataIndex];return `${esc(r.object)}<br>${number(r.value)} ${esc(r.unit)}<br>${esc(r.countryName)} · ${esc(r.statusName)}<br>${esc(r.sheet)}!${esc(r.cell)}<br>${esc(r.nature)}`;}},xAxis:{type:'value',name:card.unit,nameLocation:'middle',nameGap:30},yAxis:{type:'category',data:selected.map(r=>r.object+' · '+r.cell),axisLabel:{width:140,overflow:'truncate'}},series:[{type:type==='dot'?'scatter':'bar',barMaxWidth:22,symbolSize:11,data:selected.map((r,i)=>type==='dot'?[r.value,i]:r.value)}]};
 }
 if(card.renderer!=='official-distribution')return null;
 const countries=[...new Set(rows.map(r=>r.countryName))],states=[...new Set(rows.map(r=>r.statusName))];
 if(type==='heatmap'){
  const cells=countries.flatMap((c,i)=>states.map((s,j)=>[j,i,rows.filter(r=>r.countryName===c&&r.statusName===s).length]));
  return {...base,grid:{left:95,right:35,top:35,bottom:100},tooltip:{confine:true,formatter:p=>`${esc(countries[p.value[1]])} · ${esc(states[p.value[0]])}<br>${p.value[2]} 条登记记录`},xAxis:{type:'category',data:states,axisLabel:{rotate:25}},yAxis:{type:'category',data:countries},visualMap:{min:0,max:Math.max(...cells.map(c=>c[2])),calculable:false,orient:'horizontal',bottom:0,left:'center',inRange:{color:['#edf4f7','#277e9c']}},series:[{type:'heatmap',data:cells,label:{show:true}}]};
 }
 const key=type.startsWith('status')?'statusName':'countryName',groups=[...new Set(rows.map(r=>r[key]))].map(name=>({name,value:rows.filter(r=>r[key]===name).length})).sort((a,b)=>a.value-b.value);
 if(type==='countryPie'||type==='statusPie')return {...base,tooltip:{confine:true,formatter:p=>esc(p.name)+'<br>'+p.value+' 条登记记录（'+p.percent+'%）'},legend:{type:'scroll',bottom:0},series:[{type:'pie',radius:['42%','72%'],data:groups,label:{formatter:'{b}\n{c} 条'}}]};
 return {...base,grid:{left:140,right:40,top:35,bottom:55},tooltip:{confine:true,formatter:p=>`${esc(groups[p.dataIndex].name)}<br>${p.value} 条登记记录`},xAxis:{type:'value',minInterval:1,name:'条登记记录'},yAxis:{type:'category',data:groups.map(r=>r.name),axisLabel:{width:120,overflow:'truncate'}},series:[{type:'bar',barMaxWidth:24,data:groups.map(r=>r.value),label:{show:true,position:'right'}}]};
}
