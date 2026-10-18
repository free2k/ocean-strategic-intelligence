import {topicLabel} from '../industry-topics.mjs';
// Offer only encodings supported by the actual dimensions and measurement scale.
export function availableViews(card){
 const rows=card.rows||[];
 if(card.id==='fleet')return ['multiTrend','scatter','parallel','bar'];
 if(card.renderer==='series')return ['line','bar',...(card.types||[]).filter(t=>!['line','bar'].includes(t))];
 if(card.renderer==='metric-comparison')return ['dot','bar',...(card.types||[]).filter(t=>!['dot','bar'].includes(t))];
 if(card.renderer==='calendar')return ['calendar','dailyLine','dailyBar'];
 if(card.renderer==='registry-count')return ['bar','pie','treemap'];
 if(card.renderer==='official-distribution')return [...card.types,...(card.types.includes('countryBar')?['countryPie']:[]),...(card.types.includes('statusBar')?['statusPie']:[])];
 if(card.id==='lease-year')return ['heatmap','stackedBar'];
 if(card.id==='geography')return ['map','countryRank','countryTiles'];
 if(card.types?.includes('graph'))return ['graph','graphCircular'];
 if(card.id==='coverage')return ['sankey','sourceBar'];
 if(card.id==='reports-宏观政策')return ['scatter','monthlyBar','monthlyLine'];
 if(card.types?.length===1&&card.types[0]==='tree')return ['tree','radialTree'];
 if(card.id==='buzios-share')return ['pie','shareBar'];
 if(card.id==='ccs-plan')return ['bar','valueDot'];
 // Hierarchies, lease breakdowns and official comparable cohorts already have alternatives.
 return [...(card.types||[])];
}

const relationshipTypes=['公司','机构','项目','设施','技术','地点','其他'];
const relationshipSectors=['海洋油气','海上风电','海洋低碳','多能融合','宏观政策','海洋装备'];
const relationshipColors=['#a997ee','#7db9dd','#65cbbb','#e0b874','#d998af','#82b995','#91a8b9'];
export const relationshipEntityLegend=relationshipTypes.map((name,i)=>({name,color:relationshipColors[i]}));
const relationshipEsc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const relationshipName=value=>String(value??'').normalize('NFKC').toLocaleLowerCase().trim();
const relationTouches=(row,id)=>row.from===id||row.to===id;

// Group the existing records by their source article's domain and stable entity IDs.
export function buildRelationshipModel(data){
 const entities=new Map((data.entities||[]).map(e=>[String(e.id),e]));
 const documents=new Map((data.documents||[]).map(d=>[d.id,d]));
 const evidence=new Map((data.evidence||[]).map(e=>[e.id,e]));
 const nodes=new Map(),sectors=new Map(),seen=new Set(),relations=[];
 for(const [index,original] of (data.relations||[]).entries()){
  if(original.status==='rejected'||original.from==null||original.to==null||!documents.has(original.documentId))continue;
  const id=String(original.id??'record-'+index);if(seen.has(id))continue;seen.add(id);
  const document=documents.get(original.documentId),sector=document.industry?.primary||document.topic||'未归类';
  const row={id,from:String(original.from),to:String(original.to),type:original.type||'未标注关系',status:original.status,
   document,sector,original,proof:(original.evidenceIds||[]).map(id=>evidence.get(id)).filter(e=>e?.documentId===original.documentId&&e.quote)};
  relations.push(row);
  if(!sectors.has(sector))sectors.set(sector,{name:sector,relations:[],nodes:new Set(),types:new Map()});
  const group=sectors.get(sector);group.relations.push(row);
  for(const id of new Set([row.from,row.to])){
   if(!nodes.has(id)){
    const e=entities.get(id)||{};
    nodes.set(id,{id,name:e.nameZh||e.name||'未命名主体',type:relationshipTypes.includes(e.type)?e.type:'其他',
     search:relationshipName([e.nameZh,e.name,...(e.aliases||[])].filter(Boolean).join(' ')),relations:[],sectors:new Set()});
   }
   const node=nodes.get(id);node.relations.push(row);node.sectors.add(sector);group.nodes.add(id);
   if(!group.types.has(node.type))group.types.set(node.type,new Set());group.types.get(node.type).add(id);
  }
 }
 return {nodes,relations,sectors};
}

export function relationshipScope(model,state={}){
 const base=model.relations.filter(r=>!state.sector||r.sector===state.sector),ids=new Set(base.flatMap(r=>[r.from,r.to]));
 const degree=new Map();for(const r of base)for(const id of new Set([r.from,r.to]))degree.set(id,(degree.get(id)||0)+1);
 const query=relationshipName(state.query);
 const subjects=[...ids].map(id=>model.nodes.get(id)).filter(n=>(!state.entityType||n.type===state.entityType)&&(!query||n.search.includes(query)))
  .map(n=>({...n,degree:degree.get(n.id)||0})).sort((a,b)=>b.degree-a.degree||a.name.localeCompare(b.name,'zh-CN')||a.id.localeCompare(b.id));
 const subjectIds=new Set(subjects.map(n=>n.id));
 const branch=(name,kind,value,extra={})=>({id:JSON.stringify([kind,extra.sector||state.sector||'',name]),name,relationshipKind:kind,value,...extra});
 const typesFor=sector=>relationshipTypes.flatMap(type=>{
  const value=[...(sector.types.get(type)||[])].filter(id=>subjectIds.has(id)).length;
  return value?[branch(type,'type',value,{sector:sector.name,entityType:type,itemStyle:{color:relationshipColors[relationshipTypes.indexOf(type)]}})]:[];
 });
 const pages=Math.max(1,Math.ceil(subjects.length/12)),page=Math.max(0,Math.min(pages-1,Number.isInteger(state.page)?state.page:0));
 const pagedSubjects=subjects.slice(page*12,page*12+12);
 let hierarchy;
 if(state.entityType)hierarchy=pagedSubjects.map(n=>branch(n.name,'entity',1,{id:n.id,entityId:n.id,entityType:n.type,degree:n.degree,itemStyle:{color:relationshipColors[relationshipTypes.indexOf(n.type)]}}));
 else if(state.sector)hierarchy=model.sectors.has(state.sector)?typesFor(model.sectors.get(state.sector)):[];
 else hierarchy=[...model.sectors.values()].sort((a,b)=>{
  const ai=relationshipSectors.indexOf(a.name),bi=relationshipSectors.indexOf(b.name);
  return (ai<0?99:ai)-(bi<0?99:bi)||a.name.localeCompare(b.name,'zh-CN');
 }).flatMap(sector=>{const children=typesFor(sector),value=children.reduce((n,c)=>n+c.value,0);return value?[branch(topicLabel(sector.name),'sector',value,{sector:sector.name,children})]:[];});
 const subject=subjectIds.has(state.subject)?model.nodes.get(state.subject):null;
 const scoped=subject?base.filter(r=>relationTouches(r,subject.id)):base.filter(r=>subjectIds.has(r.from)||subjectIds.has(r.to));
 const relationTypes=[...new Set(scoped.map(r=>r.type))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
 const relations=scoped.filter(r=>!subject||!state.relationType||r.type===state.relationType).sort((a,b)=>(b.document.publishedAt||'').localeCompare(a.document.publishedAt||'')||a.id.localeCompare(b.id));
 const edgePages=Math.max(1,Math.ceil(relations.length/36)),edgePage=Math.max(0,Math.min(edgePages-1,Number.isInteger(state.edgePage)?state.edgePage:0));
 return {model,subjects,pagedSubjects,hierarchy,page,pages,subject,relations,relationTypes,edgePage,edgePages,
  visibleRelations:subject?relations.slice(edgePage*36,edgePage*36+36):[],edgeOffset:edgePage*36,documents:new Set(relations.map(r=>r.document.id)).size};
}

export function relationshipOption(scope,view,{dark=true,reduced=false,width=1000}={}){
 const ink=dark?'#e6f1fa':'#183149',muted=dark?'#91abc0':'#60788c',panel=dark?'#102131':'#f6f9fc',line=dark?'#28485d':'#d1e1e9',compact=width<650;
 const colorFor=type=>relationshipColors[relationshipTypes.indexOf(type)]||relationshipColors.at(-1);
 const short=name=>Array.from(name).length>16?Array.from(name).slice(0,16).join('')+'…':name;
 const base={backgroundColor:'transparent',color:relationshipColors,animation:!reduced,animationDuration:650,animationDurationUpdate:650,
  textStyle:{color:ink,fontFamily:'Segoe UI, Microsoft YaHei, sans-serif'},aria:{enabled:true,description:scope.subject?'当前主体及其有来源的关联记录':'按领域、主体类型和具体主体逐层浏览产业关系'},
  tooltip:{confine:true,backgroundColor:panel,borderColor:line,textStyle:{color:ink,fontSize:12},extraCssText:'max-width:340px;white-space:normal;line-height:1.7'}};
 if(!scope.subject){
  const tooltip=p=>{const n=p.data||{};return n.relationshipKind?relationshipEsc(n.name)+'<br>'+(n.relationshipKind==='entity'?relationshipEsc(n.entityType)+' · '+n.degree+' 条关联记录':n.value+' 个主体')+'<br><span style="opacity:.7">点击进入下一级</span>':relationshipEsc(n.name||'产业分类');};
  if(view==='tree')return {...base,tooltip:{...base.tooltip,formatter:tooltip},series:[{type:'tree',left:compact?'16%':'10%',right:compact?'20%':'19%',top:30,bottom:30,
   data:[{name:scope.hierarchy.length?'当前分类':'暂无主体',children:scope.hierarchy}],orient:compact?'TB':'LR',symbolSize:9,initialTreeDepth:compact?1:2,expandAndCollapse:false,
   label:{position:compact?'top':'left',align:compact?'center':'right',color:ink,fontSize:compact?10:12,formatter:p=>short(p.name)},
   leaves:{label:{position:compact?'bottom':'right',align:compact?'center':'left',color:ink}},lineStyle:{color:'#65cbbb',opacity:.45,width:1.6},itemStyle:{color:'#65cbbb',borderColor:panel,borderWidth:2},emphasis:{focus:'relative'}}]};
  return {...base,tooltip:{...base.tooltip,formatter:tooltip},series:[{type:'treemap',left:0,right:0,top:0,bottom:0,data:scope.hierarchy,nodeClick:false,roam:false,leafDepth:compact?1:2,breadcrumb:{show:false},
   label:{show:true,color:'#102c3c',fontSize:compact?12:14,overflow:'truncate',formatter:p=>p.data.relationshipKind==='entity'?short(p.name)+'\n'+p.data.degree+' 条关联':p.name+'\n'+p.value+' 个主体'},
   upperLabel:{show:true,height:38,color:ink,fontSize:compact?12:15,formatter:p=>p.name+' · '+p.value+' 个主体'},
   itemStyle:{borderColor:panel,borderWidth:4,gapWidth:5,borderRadius:7},levels:[{itemStyle:{borderWidth:0,gapWidth:10},upperLabel:{show:false}},{itemStyle:{borderColor:line,borderWidth:1,gapWidth:5},upperLabel:{backgroundColor:panel}}],
   emphasis:{itemStyle:{borderColor:'#7ce2d0',borderWidth:2},label:{show:true}}}]};
 }
 const groups=new Map();
 for(const r of scope.visibleRelations){const key=JSON.stringify([r.from,r.to,r.type]);if(!groups.has(key))groups.set(key,{source:r.from,target:r.to,type:r.type,records:[]});groups.get(key).records.push(r);}
 const links=[...groups.values()].map(g=>({...g,value:g.records.length,recordIds:g.records.map(r=>r.id)}));
 const nodeIds=new Set(links.flatMap(l=>[l.source,l.target]));
 const edgeTip=p=>{const d=p.data;if(p.dataType!=='edge')return relationshipEsc(d.displayName||d.name)+'<br>'+relationshipEsc(d.entityType||'')+'<br>点击查看该主体的关联';
  return relationshipEsc(scope.model.nodes.get(d.from||d.source)?.name||'')+' → '+relationshipEsc(scope.model.nodes.get(d.to||d.target)?.name||'')+'<br>'+relationshipEsc(d.type)+' · '+d.value+' 条记录<br>'+relationshipEsc(d.records[0]?.proof[0]?.quote?.slice(0,150)||'点击查看原文与来源');};
 if(view==='sankey'){
  // Separate endpoint roles keep genuine reciprocal links acyclic without inventing paths through shared relationship-type nodes.
  const nodes=new Map(),sankeyLinks=links.map(link=>{
   const source='from:'+link.source,target='to:'+link.target;
   for(const [id,entityId,depth] of [[source,link.source,0],[target,link.target,1]])if(!nodes.has(id)){
    const n=scope.model.nodes.get(entityId);nodes.set(id,{name:id,displayName:n.name,entityId,entityType:n.type,depth,itemStyle:{color:colorFor(n.type)}});
   }
   return {...link,from:link.source,to:link.target,source,target};
  });
  return {...base,tooltip:{...base.tooltip,formatter:edgeTip},graphic:[{type:'text',left:8,top:8,silent:true,style:{text:'关系起点',fill:muted,fontSize:12}},{type:'text',right:8,top:8,silent:true,style:{text:'关联对象',fill:muted,fontSize:12}}],
   series:[{type:'sankey',animationDuration:650,animationDurationUpdate:650,left:compact?8:15,right:compact?8:15,top:42,bottom:20,orient:'horizontal',data:[...nodes.values()],links:sankeyLinks,nodeWidth:14,nodeGap:Math.max(8,Math.min(20,420/Math.max(nodes.size/2,1))),
    layoutIterations:32,draggable:true,lineStyle:{color:'gradient',opacity:.36,curveness:.5},label:{color:ink,fontSize:compact?10:12,formatter:p=>short(p.data.displayName),width:compact?105:180,overflow:'truncate'},
    levels:[{depth:0,label:{position:'right'}},{depth:1,label:{position:'left'}}],itemStyle:{borderWidth:0,borderRadius:4},emphasis:{focus:'adjacency',lineStyle:{opacity:.75}}}]};
 }
 const degrees=new Map();for(const r of scope.relations)for(const id of new Set([r.from,r.to]))degrees.set(id,(degrees.get(id)||0)+1);
 const nodes=[...nodeIds].map(id=>{const n=scope.model.nodes.get(id),selected=id===scope.subject.id,degree=degrees.get(id)||0;return {id,name:n.name,displayName:n.name,entityId:id,entityType:n.type,value:degree,
  symbolSize:selected?58:Math.min(38,17+Math.sqrt(degree)*3),itemStyle:{color:colorFor(n.type),borderColor:selected?'#e8ffff':panel,borderWidth:selected?3:1.5,shadowBlur:dark?14:3,shadowColor:colorFor(n.type)},
  label:{show:selected||nodeIds.size<=24,color:ink,fontSize:selected?13:11,fontWeight:selected?600:400,formatter:short(n.name)}};});
 return {...base,tooltip:{...base.tooltip,formatter:edgeTip},series:[{type:'graph',left:compact?20:40,right:compact?80:110,top:30,bottom:30,layout:view==='circular'?'circular':'force',data:nodes,
  links:links.map(l=>({...l,lineStyle:{width:1+Math.log2(l.value+1),color:'#70bfc7',opacity:.55,type:l.records.every(r=>r.status==='verified'||r.status==='confirmed')?'solid':'dashed',curveness:l.source===l.target?.6:.14}})),
  roam:true,draggable:true,scaleLimit:{min:.4,max:3},force:{repulsion:compact?190:320,gravity:.12,edgeLength:compact?[75,135]:[110,190],layoutAnimation:!reduced},circular:{rotateLabel:false},
  edgeSymbol:['none','arrow'],edgeSymbolSize:7,label:{position:'right',color:ink},edgeLabel:{show:links.length<=16,color:muted,fontSize:10,formatter:p=>p.data.type},
  emphasis:{focus:'adjacency',label:{show:true},lineStyle:{width:3,opacity:1}},blur:{itemStyle:{opacity:.16},lineStyle:{opacity:.06}}}]};
}
