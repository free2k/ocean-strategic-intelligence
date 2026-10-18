import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRelationshipModel,refineRelationshipModel,relationshipNetwork,relationshipTree,relationshipTreeOption} from '../quant-preview/chart-views.js';
const data=()=>({
 entities:[{id:'a',name:'同名企业',type:'公司',aliases:['Alpha']},{id:'b',name:'同名企业',type:'公司'},{id:'c',name:'风电项目',type:'项目'},{id:'d',name:'海域',type:'地点'}],
 documents:[{id:'wind',topic:'海上风电'},{id:'oil',topic:'海洋油气'}],
 relations:[{id:'r1',from:'a',to:'c',type:'投资',documentId:'wind'},{id:'r2',from:'a',to:'c',type:'投资',documentId:'wind'},
  {id:'r3',from:'c',to:'a',type:'合作',documentId:'wind'},{id:'r4',from:'a',to:'a',type:'研发',documentId:'wind'},
  {id:'r5',from:'b',to:'d',type:'运营',documentId:'oil'},{id:'r6',from:'a',to:'b',type:'合作',documentId:'oil'}],evidence:[]
});
const walk=root=>root?[root,...root.children.flatMap(walk)]:[];
const records=tree=>[...new Set(walk(tree.root).filter(n=>n.kind==='relation').flatMap(n=>n.recordIds))].sort();
test('tree preserves all graph records and distinct identities without mutating their source',()=>{
 const input=data(),before=structuredClone(input),network=relationshipNetwork(buildRelationshipModel(input)),tree=relationshipTree(network);
 assert.deepEqual(records(tree),network.relations.map(r=>r.id).sort());
 assert.deepEqual(tree.root.children.map(n=>n.sector),['海洋油气','海上风电']);
 const nodes=walk(tree.root),ids=nodes.map(n=>n.id);assert.equal(ids.length,new Set(ids).size);
 const homonyms=nodes.filter(n=>n.kind==='entity'&&n.name==='同名企业');assert.deepEqual([...new Set(homonyms.map(n=>n.entityId))].sort(),['a','b']);
 assert.equal(tree.root.count,network.entityCount);assert.deepEqual(input,before);
});
test('focused branches preserve incoming, reciprocal, parallel and self relations with their directions',()=>{
 const network=relationshipNetwork(buildRelationshipModel(data()),{sector:'海上风电',subject:'a'}),tree=relationshipTree(network);
 assert.deepEqual(records(tree),['r1','r2','r3','r4']);
 const leaves=walk(tree.root).filter(n=>n.kind==='relation');
 assert.deepEqual(leaves.find(n=>n.type==='投资').recordIds,['r1','r2']);assert.equal(leaves.find(n=>n.type==='合作').direction,'in');
 assert.equal(leaves.find(n=>n.type==='研发').entityId,'a');assert.equal(tree.root.count,4);
});
test('domain, type and secondary refinements retain exactly the graph scope and opposite endpoints',()=>{
 const model=refineRelationshipModel(buildRelationshipModel(data()),{entityType:'公司',relationType:'投资'});
 const network=relationshipNetwork(model,{sector:'海上风电',entityType:'公司'}),tree=relationshipTree(network);
 assert.deepEqual(tree.recordIds,['r1','r2']);assert.deepEqual(records(tree),['r1','r2']);
 assert.equal(tree.root.children.length,1);assert.ok(walk(tree.root).some(n=>n.kind==='relation'&&n.entityId==='c'));
 assert.ok(!walk(tree.root).some(n=>n.sector==='海洋油气'));
});
test('all pages remain reachable without sampling or changing counts, and full expansion includes every record',()=>{
 const count=71,input={entities:[{id:'hub',name:'枢纽',type:'公司'},...Array.from({length:count},(_,i)=>({id:'p'+i,name:'项目'+i,type:'项目'}))],documents:[{id:'d',topic:'海上风电'}],relations:Array.from({length:count},(_,i)=>({id:'r'+i,from:'hub',to:'p'+i,type:i%2?'合作':'投资',documentId:'d'}))};
 const model=buildRelationshipModel(input),network=relationshipNetwork(model,{subject:'hub'}),first=relationshipTree(network),seen=new Set();
 assert.equal(first.pages,6);assert.equal(first.total,count);assert.equal(first.root.count,count);
 for(let page=0;page<first.pages;page++){const tree=relationshipTree(network,{page});assert.equal(tree.root.count,count);records(tree).forEach(id=>seen.add(id));}
 assert.equal(seen.size,count);assert.equal(relationshipTree(network,{page:999}).page,5);
 const all=relationshipTree(network,{expanded:true});assert.equal(all.pages,1);assert.equal(records(all).length,count);assert.equal(all.depth,Infinity);
 const typed=relationshipNetwork(model,{sector:'海上风电',entityType:'项目'}),typedIds=new Set();
 for(let page=0;page<relationshipTree(typed).pages;page++)for(const node of relationshipTree(typed,{page}).root.children)typedIds.add(node.entityId);
 assert.equal(typedIds.size,count);
});
test('empty filtered branches stay empty in both overview and full expansion',()=>{
 const model=refineRelationshipModel(buildRelationshipModel(data()),{relationType:'不存在'}),network=relationshipNetwork(model);
 for(const expanded of [false,true]){const tree=relationshipTree(network,{expanded});assert.equal(tree.root,null);assert.deepEqual(tree.recordIds,[]);assert.deepEqual(relationshipTreeOption(tree).series[0].data,[]);}
});
test('tree keeps labels readable through controlled depth and supports themes, motion preference and safe tooltips',()=>{
 const input=data();input.entities[0].name='<img src=x onerror=alert(1)>';
 const tree=relationshipTree(relationshipNetwork(buildRelationshipModel(input))),dark=relationshipTreeOption(tree,{reduced:true}),light=relationshipTreeOption(tree,{dark:false});
 assert.equal(dark.series[0].type,'tree');assert.equal(dark.animation,false);assert.equal(dark.series[0].data[0].collapsed,false);
 assert.ok(dark.series[0].data[0].children.every(sector=>sector.children.every(type=>type.collapsed)));
 assert.notEqual(dark.series[0].data[0].itemStyle.color,light.series[0].data[0].itemStyle.color);
 const node=walk(tree.root).find(n=>n.entityId==='a');assert.ok(!dark.tooltip.formatter({data:node}).includes('<img'));assert.match(dark.tooltip.formatter({data:node}),/&lt;img/);
});
