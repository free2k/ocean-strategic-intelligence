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

// The expanded explorer keeps every saved relation in the selected scope. Only
// search results are paginated; graph nodes and source records are never sampled.
export function relationshipNetwork(model,state={}){
 const sector=model.sectors.has(state.sector)?state.sector:'';
 const base=sector?model.sectors.get(sector).relations:model.relations;
 const baseIds=new Set(base.flatMap(r=>[r.from,r.to]));
 const subject=baseIds.has(state.subject)?model.nodes.get(state.subject):null;
 const primary=new Set([...baseIds].filter(id=>!state.entityType||model.nodes.get(id).type===state.entityType));
 const related=subject?base.filter(r=>relationTouches(r,subject.id)):base.filter(r=>primary.has(r.from)||primary.has(r.to));
 const relationTypes=[...new Set(related.map(r=>r.type))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
 const relations=related.filter(r=>!subject||!state.relationType||r.type===state.relationType);
 const ids=new Set(relations.flatMap(r=>[r.from,r.to])),degrees=new Map();
 for(const r of relations)for(const id of new Set([r.from,r.to]))degrees.set(id,(degrees.get(id)||0)+1);
 const nodes=[],links=[],membership=(id,domain)=>JSON.stringify(['entity',domain,id]);
 const entity=(id,domain)=>{const n=model.nodes.get(id);return {id:membership(id,domain),name:n.name,entityId:id,sector:domain,entityType:n.type,kind:'entity',count:degrees.get(id)||0,context:!subject&&!!state.entityType&&!primary.has(id)};};
 const byId=new Map();
 const add=n=>{nodes.push(n);byId.set(n.id,n);return n;};
 const classify=(from,to)=>links.push({source:from.id,target:to.id,kind:'classification',targetKind:to.kind,sector:to.sector,entityType:to.entityType,entityId:to.entityId});
 const polar=(node,r,angle)=>{node.x=r*Math.cos(angle);node.y=r*Math.sin(angle);};
 if(subject){
  add({...entity(subject.id,sector),selected:true,x:0,y:0});
  const neighbors=[...ids].filter(id=>id!==subject.id).sort((a,b)=>relationshipTypes.indexOf(model.nodes.get(a).type)-relationshipTypes.indexOf(model.nodes.get(b).type)||model.nodes.get(a).name.localeCompare(model.nodes.get(b).name,'zh-CN'));
  const rings=Math.max(1,Math.ceil(Math.sqrt(neighbors.length/28)));
  neighbors.forEach((id,i)=>{const ring=i%rings,index=Math.floor(i/rings),length=Math.ceil((neighbors.length-ring)/rings);polar(add(entity(id,sector)),320+ring*165,index*2*Math.PI/length-Math.PI/2);});
 }else if(ids.size){
  const root=add({id:JSON.stringify(['root',sector,state.entityType||'']),name:state.entityType||topicLabel(sector)||'产业关联',kind:'root',count:state.entityType?primary.size:ids.size,x:0,y:0});
  if(!sector&&!state.entityType)root.name='产业关联';
  const domains=[...model.sectors.keys()].filter(name=>!sector||name===sector).sort((a,b)=>{
   const order=n=>relationshipSectors.includes(n)?relationshipSectors.indexOf(n):99;
   return order(a)-order(b)||a.localeCompare(b,'zh-CN');
  }).map(name=>({name,ids:new Set(relations.filter(r=>r.sector===name).flatMap(r=>[r.from,r.to]))})).filter(d=>d.ids.size);
  const weights=domains.map(d=>Math.pow(Math.max(12,d.ids.size),.7)),total=weights.reduce((a,b)=>a+b,0),minimumSpan=2*Math.PI/domains.length*.58;
  let start=-Math.PI/2;
  domains.forEach((domain,di)=>{
   const span=minimumSpan+(2*Math.PI-minimumSpan*domains.length)*weights[di]/total,angle=start+span/2;
   const parent=sector?root:add({id:JSON.stringify(['sector',domain.name]),name:topicLabel(domain.name),kind:'sector',sector:domain.name,count:domain.ids.size});
   if(!sector){polar(parent,310,angle);classify(root,parent);}
   const groups=relationshipTypes.map(type=>({type,ids:[...domain.ids].filter(id=>model.nodes.get(id).type===type).sort((a,b)=>model.nodes.get(a).name.localeCompare(model.nodes.get(b).name,'zh-CN')||a.localeCompare(b))})).filter(g=>g.ids.length);
   const groupWeights=groups.map(g=>Math.pow(Math.max(4,g.ids.length),.8)),groupTotal=groupWeights.reduce((a,b)=>a+b,0);
   let groupStart=start;
   groups.forEach((group,gi)=>{
    const groupSpan=span*groupWeights[gi]/groupTotal,groupAngle=groupStart+groupSpan/2;
    const context=!!state.entityType&&state.entityType!==group.type;
    const hub=sector&&state.entityType===group.type?root:add({id:JSON.stringify(['type',domain.name,group.type]),name:context?'关联'+group.type:group.type,kind:'type',sector:domain.name,entityType:group.type,count:group.ids.length,context});
    if(hub!==root){polar(hub,sector?330:660,groupAngle);classify(parent,hub);}
    group.ids.forEach((id,i)=>{
     const n=add(entity(id,domain.name)),entityAngle=groupStart+groupSpan*(i+.5)/group.ids.length;
     polar(n,(sector?720:1090)+(i%5-2)*43,entityAngle);classify(hub,n);
    });
    groupStart+=groupSpan;
   });
   start+=span;
  });
 }
 const grouped=new Map();
 for(const r of relations){
  const source=membership(r.from,subject?sector:r.sector),target=membership(r.to,subject?sector:r.sector),key=JSON.stringify([source,target,r.type]);
  if(!grouped.has(key))grouped.set(key,{source,target,kind:'relation',type:r.type,from:r.from,to:r.to,recordIds:[],confirmed:true});
  const edge=grouped.get(key);edge.recordIds.push(r.id);edge.confirmed&&=r.status==='verified'||r.status==='confirmed';
 }
 links.push(...grouped.values());
 return {model,nodes,links,relations,subject,sector,entityType:state.entityType||'',relationTypes,entityCount:ids.size,primaryCount:primary.size,documents:new Set(relations.map(r=>r.document.id)).size};
}

export function searchRelationshipNodes(model,query=''){
 const term=relationshipName(query),matches=[];
 const match=(...values)=>values.some(value=>relationshipName(value).includes(term));
 for(const group of model.sectors.values()){
  if(!term||match(group.name,topicLabel(group.name)))matches.push({kind:'sector',id:group.name,name:topicLabel(group.name),sector:group.name,count:group.nodes.size,detail:'产业领域'});
  if(term)for(const [type,ids] of group.types)if(match(type))matches.push({kind:'type',id:JSON.stringify([group.name,type]),name:type,sector:group.name,entityType:type,count:ids.size,detail:topicLabel(group.name)});
 }
 if(term)for(const n of model.nodes.values())if(n.search.includes(term))matches.push({kind:'entity',id:n.id,entityId:n.id,name:n.name,entityType:n.type,count:n.relations.length,detail:n.type+' · '+[...n.sectors].map(topicLabel).join(' / ')});
 return matches.sort((a,b)=>Number(relationshipName(b.name)===term)-Number(relationshipName(a.name)===term)||b.count-a.count||a.name.localeCompare(b.name,'zh-CN')||a.id.localeCompare(b.id));
}

export function relationshipGraphOption(network,{dark=true,reduced=false,width=1000,height=690,detail=false}={}){
 const ink=dark?'#e6f1fa':'#183149',muted=dark?'#96b0c6':'#60788c',panel=dark?'#102131':'#f6f9fc',compact=width<650;
 const colors=type=>relationshipColors[relationshipTypes.indexOf(type)]||'#65cbbb';
 const short=name=>Array.from(name).length>18?Array.from(name).slice(0,18).join('')+'…':name;
 const overview=!network.sector&&!network.entityType&&!network.subject,detailed=detail||network.entityCount<=(compact?20:36);
 const size=Math.max(160,Math.min(width-(compact?40:130),height-90));
 const nodes=network.nodes.map(n=>{
  const isEntity=n.kind==='entity',color=n.kind==='root'?'#65cbbb':n.kind==='sector'?'#80cbd4':colors(n.entityType);
  const baseSize=n.kind==='root'?55:n.kind==='sector'?32:n.kind==='type'?18:n.selected?58:network.subject?(network.entityCount>80?8:19):Math.min(10,4+Math.sqrt(n.count)*.65);
  const size=baseSize*(compact?(overview?.55:.85):1);
  return {...n,symbolSize:size,itemStyle:{color,opacity:n.context?.5:1,borderColor:n.selected?ink:panel,borderWidth:n.selected?3:isEntity?.5:2,shadowBlur:n.selected?20:n.kind==='root'?15:0,shadowColor:color},
   label:{show:(isEntity?n.selected||detailed:!(compact&&overview&&n.kind==='type'))||detail,position:n.kind==='root'?'inside':'right',color:n.kind==='root'?'#102c3c':ink,fontSize:compact?9:n.kind==='root'?12:n.kind==='sector'?13:11,fontWeight:n.selected||!isEntity?600:400,formatter:n.kind==='type'?n.name+' · '+n.count:compact&&n.kind==='root'&&n.name==='产业关联'?'产业\n关联':short(n.name),distance:isEntity?4:5},
   emphasis:{label:{show:true,formatter:n.name,fontSize:12,backgroundColor:panel,padding:[5,7],borderRadius:4},itemStyle:{opacity:1,borderColor:ink,borderWidth:2}}};
 });
 const links=network.links.map(l=>({...l,value:l.recordIds?.length||1,symbol:l.kind==='relation'?['none','arrow']:['none','none'],symbolSize:5,
  lineStyle:l.kind==='classification'?{color:dark?'#6d9caa':'#7b9eaf',opacity:.4,width:.9,curveness:0}:{color:dark?'#8ec6c9':'#507f97',opacity:network.subject?.65:.18,width:network.subject?1.5:Math.min(2,.55+Math.log2(l.recordIds.length+1)*.3),type:l.confirmed?'solid':'dashed',curveness:l.source===l.target?.65:.13},
  label:{show:!!network.subject&&network.links.length<=24&&l.kind==='relation',formatter:l.type,fontSize:10,color:muted}}));
 return {backgroundColor:'transparent',animation:!reduced,animationDuration:550,animationDurationUpdate:550,animationThreshold:10000,textStyle:{fontFamily:'Segoe UI, Microsoft YaHei, sans-serif'},
  aria:{enabled:true,description:'已展开的产业关系图。领域连接主体类型，主体类型连接具体主体；箭头表示有原文记录的关系。点击节点放大下钻。'},
  tooltip:{confine:true,backgroundColor:panel,borderColor:dark?'#28485d':'#c5dce5',textStyle:{color:ink,fontSize:12},extraCssText:'max-width:340px;white-space:normal;line-height:1.8',formatter:p=>{
   const d=p.data;
   if(p.dataType==='edge')return d.kind==='classification'?'分类归属连线<br>点击进入对应分类':relationshipEsc(network.model.nodes.get(d.from)?.name)+' → '+relationshipEsc(network.model.nodes.get(d.to)?.name)+'<br>'+relationshipEsc(d.type)+' · '+d.recordIds.length+' 条原文记录<br>点击连线查看来源证据';
   return relationshipEsc(d.name)+'<br>'+(d.kind==='entity'?relationshipEsc(d.entityType)+' · '+d.count+' 条关联记录':d.count+' 个主体')+'<br>点击放大并展开关联';
  }},series:[{id:'industry-relationship-network',type:'graph',layout:'none',left:(width-size)/2,top:(height-size)/2,width:size,height:size,zoom:1,center:[0,0],data:nodes,links,
   roam:true,draggable:true,scaleLimit:{min:.35,max:12},labelLayout:{hideOverlap:true},emphasis:{focus:'adjacency',lineStyle:{opacity:1,width:2.5}},blur:{itemStyle:{opacity:.15},lineStyle:{opacity:.05}}}]};
}
