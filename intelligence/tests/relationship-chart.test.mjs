import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRelationshipModel,relationshipScope,relationshipOption,availableViews} from '../quant-preview/chart-views.js';

const fixture=()=>({
 entities:[{id:'a',name:'Same',nameZh:'同名企业',type:'公司',aliases:['Alpha']},{id:'b',name:'同名企业',type:'公司'},
  {id:'c',name:'风电项目',type:'项目'},{id:'d',name:'海域',type:'地点'}],
 documents:[{id:'wind',title:'风电原文',topic:'海上风电',publishedAt:'2026-10-17'},{id:'oil',title:'油气原文',topic:'海洋油气',publishedAt:'2026-10-18'}],
 evidence:[{id:'correct',documentId:'wind',quote:'原文明确的关联。'},{id:'wrong',documentId:'oil',quote:'其他文章。'}],
 relations:[{id:'1',from:'a',to:'c',type:'投资',documentId:'wind',evidenceIds:['correct','wrong'],status:'extracted'},
  {id:'2',from:'c',to:'a',type:'合作',documentId:'wind',evidenceIds:['correct'],status:'candidate'},
  {id:'3',from:'b',to:'d',type:'运营',documentId:'oil',evidenceIds:[],status:'verified'},
  {id:'4',from:'a',to:'b',type:'合作',documentId:'oil',evidenceIds:[],status:'extracted'}]
});

test('classification follows source domains, entity types and stable identities without mutating records',()=>{
 const data=fixture(),before=structuredClone(data),model=buildRelationshipModel(data),root=relationshipScope(model);
 assert.equal(model.nodes.size,4);assert.equal(model.relations.length,4);
 assert.deepEqual(root.hierarchy.map(n=>n.sector),['海洋油气','海上风电']);
 const branchIds=root.hierarchy.flatMap(n=>[n.id,...n.children.map(c=>c.id)]);assert.equal(new Set(branchIds).size,branchIds.length);
 assert.equal(root.hierarchy.reduce((n,g)=>n+g.value,0),5); // One entity belongs to both source domains.
 assert.equal(model.sectors.get('海上风电').types.get('公司').size,1);
 assert.equal(model.nodes.get('a').name,model.nodes.get('b').name);
 assert.notEqual(model.nodes.get('a').id,model.nodes.get('b').id);
 assert.deepEqual(data,before);
});

test('domain/type drill-down and alias searches preserve their scope',()=>{
 const model=buildRelationshipModel(fixture());
 const typed=relationshipScope(model,{sector:'海上风电',entityType:'公司'});
 assert.deepEqual(typed.subjects.map(n=>n.id),['a']);
 assert.deepEqual(typed.hierarchy.map(n=>n.relationshipKind),['entity']);
 assert.equal(relationshipScope(model,{query:'ＡＬＰＨＡ'}).subjects[0].id,'a');
 assert.equal(relationshipScope(model,{sector:'海洋油气',entityType:'项目'}).subjects.length,0);
 assert.equal(relationshipScope(model,{query:'不存在'}).hierarchy.length,0);
 const incoming=relationshipScope(model,{sector:'海洋油气',entityType:'地点',subject:'d'});
 assert.equal(incoming.subject.id,'d');assert.deepEqual(incoming.relations.map(r=>r.id),['3']);
});

test('duplicate, rejected and out-of-scope records cannot inflate counts or attach foreign evidence',()=>{
 const data=fixture();data.relations.push({...data.relations[0]},{id:'rejected',from:'a',to:'d',documentId:'wind',status:'rejected'},
  {id:'missing',from:'a',to:'d',documentId:'missing'});
 const model=buildRelationshipModel(data);
 assert.equal(model.relations.length,4);
 assert.deepEqual(model.relations.find(r=>r.id==='1').proof.map(p=>p.id),['correct']);
});

test('graph encodings keep homonyms separate and retain every source record when aggregating an edge',()=>{
 const data=fixture();data.relations.push({...data.relations[3],id:'5'});
 const scope=relationshipScope(buildRelationshipModel(data),{entityType:'公司',subject:'a'});
 const option=relationshipOption(scope,'graph'),series=option.series[0],edge=series.links.find(l=>l.target==='b');
 assert.equal(series.data.filter(n=>n.name==='同名企业').length,2);
 assert.equal(edge.value,2);assert.deepEqual(edge.recordIds.sort(),['4','5']);
 assert.equal(series.edgeSymbol[1],'arrow');assert.equal(series.type,'graph');
});

test('Sankey endpoints are role-specific and acyclic even for reciprocal and self relations',()=>{
 const data=fixture();data.relations.push({id:'self',from:'a',to:'a',type:'记录',documentId:'wind',evidenceIds:[]});
 const model=buildRelationshipModel(data),scope=relationshipScope(model,{sector:'海上风电',entityType:'公司',subject:'a'});
 assert.equal(scope.subject.relations.length,4); // Self relation contributes only once.
 const series=relationshipOption(scope,'sankey').series[0],nodes=new Map(series.data.map(n=>[n.name,n]));
 assert.equal(series.type,'sankey');
 for(const edge of series.links){assert.equal(nodes.get(edge.source).depth,0);assert.equal(nodes.get(edge.target).depth,1);assert.ok(edge.recordIds.length);}
 assert.equal(series.links.length,3);
 assert.ok(nodes.has('from:a')&&nodes.has('to:a'));
});

test('large collections keep overview size bounded and every detailed relation accessible by pagination',()=>{
 const data=fixture();data.entities=Array.from({length:1500},(_,i)=>({id:'n'+i,name:'主体'+i,type:'公司'}));
 data.relations=Array.from({length:1499},(_,i)=>({id:'r'+i,from:'n0',to:'n'+(i+1),type:'合作',documentId:'oil',evidenceIds:[]}));
 const model=buildRelationshipModel(data),root=relationshipScope(model);
 assert.equal(root.subjects.length,1500);assert.equal(root.hierarchy.length,1);assert.equal(root.hierarchy[0].children.length,1);
 assert.equal(relationshipScope(model,{sector:'海洋油气',entityType:'公司',page:100}).hierarchy.length,12);
 const initial=relationshipScope(model,{entityType:'公司',subject:'n0'}),seen=new Set();
 for(let page=0;page<initial.edgePages;page++){
  const selected=relationshipScope(model,{entityType:'公司',subject:'n0',edgePage:page});
  assert.ok(selected.visibleRelations.length<=36);selected.visibleRelations.forEach(r=>seen.add(r.id));
 }
 assert.equal(seen.size,1499);
 assert.equal(relationshipScope(model,{page:-5}).page,0);
 assert.equal(relationshipScope(model,{page:99999}).page,root.pages-1);
});

test('tooltips escape source names and quotes; reduced motion and compact hierarchy remain available',()=>{
 const data=fixture();data.entities[0].nameZh='<img src=x onerror=alert(1)>';
 const scope=relationshipScope(buildRelationshipModel(data),{entityType:'公司',subject:'a'});
 const option=relationshipOption(scope,'graph',{reduced:true,width:390});
 assert.equal(option.animation,false);assert.equal(option.series[0].force.layoutAnimation,false);
 const tooltip=option.tooltip.formatter({dataType:'node',data:option.series[0].data.find(n=>n.entityId==='a')});
 assert.ok(tooltip.includes('&lt;img'));assert.ok(!tooltip.includes('<img'));
 const root=relationshipScope(buildRelationshipModel(data));
 assert.equal(relationshipOption(root,'treemap',{width:390}).series[0].leafDepth,1);
 assert.equal(relationshipOption(root,'tree',{width:390}).series[0].initialTreeDepth,1);
 assert.deepEqual(availableViews({types:['graph']}),['graph','graphCircular']);
});
