import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceData} from '../workspace-data.mjs';
import {buildRelationshipModel,relationshipNetwork} from '../quant-preview/chart-views.js';
const snapshot=()=>({
 generatedAt:'2026-10-18',metrics:{documents:2,events:1,relations:1},sources:[{id:'source',name:'原始来源'}],topics:['海上风电'],countryOptions:[{code:'CN'}],
 documents:[{id:'a',topic:'海上风电',title:'原文标题',titleZh:'中文标题',url:'https://example.test/a',summaryZh:'可见摘要',originalContent:'原文'.repeat(10000),evidenceAssets:[{text:'OCR'.repeat(10000)}],translationCheckpoint:{text:'处理片段'},industry:{primary:'海上风电',status:'accepted',manual:true,positive:[{quote:'历史判定长文本'}]}},{id:'b',topic:'海上风电',title:'另一篇原文'}],
 entities:[{id:'one',name:'One',nameZh:'主体甲',aliases:['ONE'],type:'公司',evidenceIds:['unused']},{id:'two',name:'主体乙',type:'项目'}],
 relations:[{id:'r',from:'one',to:'two',type:'投资',documentId:'a',evidenceIds:['proof','foreign']}],
 evidence:[{id:'proof',documentId:'a',quote:'原文证据',quoteZh:'中文证据'},{id:'unrelated',documentId:'b',quote:'其他证据'},{id:'foreign',documentId:'b',quote:'其他文档的证据'}],
 events:[{id:'event',documentId:'a',countries:['CN']}],observations:[{id:'zero',rawValue:'0',unit:'MW'}],
 series:[{id:'s',rows:[{period:'2026-01',value:0},{period:'2026-02',value:-2}]}],reportCatalog:[{url:'https://example.test/report'}],connections:[],errors:[]
});
test('legacy API shape remains unchanged and page projections never mutate stored records',()=>{
 const data=snapshot(),before=structuredClone(data);assert.equal(workspaceData(data),data);
 for(const projection of ['summary','relations','full'])workspaceData(data,projection);
 assert.deepEqual(data,before);assert.throws(()=>workspaceData(data,'unknown'),RangeError);
});
test('summary carries true scope counts and lookup metadata without document and evidence bulk',()=>{
 const data=snapshot(),summary=workspaceData(data,'summary');
 assert.deepEqual(summary.scopeCounts,{documents:2,seriesRows:2});assert.deepEqual(summary.metrics,data.metrics);
 for(const key of ['documents','events','relations','observations','evidence','series'])assert.deepEqual(summary[key],[]);
 assert.deepEqual(summary.sources,data.sources);assert.deepEqual(summary.countryOptions,data.countryOptions);
 assert.equal(summary.entities[0].nameZh,'主体甲');assert.deepEqual(summary.entities[0].aliases,['ONE']);
 assert.ok(JSON.stringify(summary).length<JSON.stringify(data).length/20);
});
test('relationship projection preserves every node, record, alias and correctly attributed evidence',()=>{
 const data=snapshot(),compact=workspaceData(data,'relations'),before=buildRelationshipModel(data),after=buildRelationshipModel(compact);
 assert.deepEqual(relationshipNetwork(after).links,relationshipNetwork(before).links);
 assert.deepEqual([...after.nodes.values()].map(n=>[n.id,n.name,n.search]),[...before.nodes.values()].map(n=>[n.id,n.name,n.search]));
 assert.deepEqual(after.relations[0].proof,before.relations[0].proof);
 assert.deepEqual(after.relations[0].proof.map(e=>e.id),['proof']);
 assert.ok(!compact.evidence.some(e=>e.id==='unrelated'));
 assert.equal(compact.documents[0].originalContent,undefined);assert.equal(compact.documents[0].evidenceAssets,undefined);
 assert.equal(compact.documents[0].industry.primary,'海上风电');
});
test('full list projection retains all records, numeric zero, units and source links',()=>{
 const data=snapshot(),compact=workspaceData(data,'full');
 for(const key of ['events','relations','observations','series','evidence','reportCatalog'])assert.deepEqual(compact[key],data[key]);
 assert.equal(compact.documents[0].summaryZh,data.documents[0].summaryZh);assert.equal(compact.documents[0].url,data.documents[0].url);
 assert.equal(compact.observations[0].rawValue,'0');assert.equal(compact.series[0].rows[0].value,0);
 assert.equal(compact.documents[0].industry.manual,true);
 assert.equal(compact.documents[0].translationCheckpoint,undefined);
});
test('an empty filtered snapshot stays empty in every page projection',()=>{
 const empty={...snapshot(),documents:[],entities:[],events:[],relations:[],evidence:[],observations:[],series:[],metrics:{documents:0}};
 for(const projection of ['summary','relations','full']){
  const data=workspaceData(empty,projection);assert.equal(data.scopeCounts.documents,0);
  assert.equal(relationshipNetwork(buildRelationshipModel(data)).relations.length,0);
 }
});
