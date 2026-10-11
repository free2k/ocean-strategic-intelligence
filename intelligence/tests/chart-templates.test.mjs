import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSeries,planTemplates,publicationDay} from '../quant-preview/planner.mjs';
import {exactValue,comparableGroups} from '../quant-preview/metric-normalize.mjs';
const base=()=>({cards:[],sources:[],series:[],documents:[],observations:[],industries:[]});
test('new RSS timestamps enter publication calendar using Hong Kong date',()=>{
 assert.equal(publicationDay('2026-10-10T18:29:50.432Z'),'2026-10-11');
 assert.equal(publicationDay('2026-10-06'),'2026-10-06');assert.equal(publicationDay('2026-02-30'),null);
 const c=base();c.documents=[{id:'rss',title:'RSS',sourceId:'s',topic:'海上风电',publishedAt:'2026-10-06T01:30:00.000Z',classification:{status:'accepted'}}];
 assert.equal(planTemplates(c).cards.find(c=>c.renderer==='calendar').rows[0].period,'2026-10-06');
});
test('new official metric automatically selects monthly distribution views without known ID',()=>{
 const c=base();c.series=[{id:'new-capacity',name:'新指标',topic:'海洋低碳',unit:'吨',frequency:'月度',rows:Array.from({length:6},(_,i)=>({period:`2026-0${i+1}`,value:i+1}))}];
 const result=planTemplates(c);assert.deepEqual(result.cards[0].types,['heatmap','line','boxplot']);assert.equal(result.cards[0].rows.length,6);
 c.series[0].rows.push({period:'2026-07',value:7});assert.equal(planTemplates(c).cards[0].rows.length,7);
});
test('revisions deduplicate periods; invalid dates, non-finite and string values rejected',()=>{
 const r=normalizeSeries({unit:'%',rows:[{period:'2026-Q1',value:1},{period:'2026-Q1',value:2},{period:'2026-Q5',value:3},{period:'2026-13',value:3},{period:'2026-Q2',value:NaN},{period:'2026-Q3',value:'4'}]});
 assert.deepEqual(r.rows.map(x=>x.value),[2]);assert.equal(r.rejected.length,4);
});
test('unknown units and insufficient periods cannot trigger official chart',()=>{
 const c=base();c.series=[{id:'x',rows:[{period:'2026-01',value:2},{period:'2026-02',value:3}]}];assert.equal(planTemplates(c).cards.length,0);
});
test('monthly and quarterly observations cannot form one generic series',()=>{
 const c=base();c.series=[{id:'mixed',name:'混合统计',unit:'吨',rows:[{period:'2026-01',value:2},{period:'2026-Q1',value:3}]}];
 const result=planTemplates(c);assert.equal(result.cards.length,0);assert.match(result.planner.decisions[0].reason,/混合/);
});
test('exact scalar handles signs, rejects bounds, duplicate scale and mixed values',()=>{
 assert.equal(exactValue('1 050 m3','m3'),1050);assert.equal(exactValue('1 05 m3','m3'),null);
 assert.equal(exactValue('-2.5','%'),-2.5);assert.equal(exactValue('10万吨','万吨'),10);assert.equal(exactValue('10万','吨'),100000);
 for(const raw of ['约10','10～20','10万','1 and 2'])assert.equal(exactValue(raw,'万吨'),null);
});
test('literal subject prefixes normalize without semantic guessing',()=>{
 const rows=['A井','B井'].map((subject,i)=>({id:subject,subject,name:subject+'总漏失量',rawValue:String(100+i),unit:'m3',nature:'实际',documentId:'paper',included:true,proof:[{quote:String(100+i)+' m3'}]}));
 assert.equal(comparableGroups(rows).groups.length,1);assert.equal(comparableGroups(rows).groups[0].rows[0].metricName,'总漏失量');
 rows[1].name='B井年度总漏失量';assert.equal(comparableGroups(rows).groups.length,0);
});
test('article comparison never mixes document, unit, nature or conflicting subjects',()=>{
 const make=(id,subject,value,more={})=>({id,subject,rawValue:String(value),unit:'吨',name:'产量',nature:'实际',documentId:'a',included:true,proof:[{quote:`产量为${value}吨`}],...more});
 const a=make('1','甲',10),b=make('2','乙',20);
 assert.equal(comparableGroups([a,b]).groups.length,1);
 for(const extra of [{documentId:'b'},{unit:'桶'},{nature:'计划'},{period:'2026'}])assert.equal(comparableGroups([a,{...b,...extra}]).groups.length,0);
 assert.equal(comparableGroups([a,b,make('3','甲',30)]).groups.length,0);
 assert.equal(comparableGroups([a,{...b,proof:[{quote:'没有任何数字'}]}]).groups.length,0);
});
test('unmatched articles and invalid dates do not enter hierarchy or calendar',()=>{
 const c=base();c.documents=[{id:'a',title:'A',topic:'海洋装备',sourceId:'s',publishedAt:'2026-99-99',classification:{status:'accepted'}},{id:'b',title:'B',topic:'海洋装备',classification:{status:'unmatched'}}];
 const r=planTemplates(c);assert.equal(r.cards.length,1);assert.equal(r.cards[0].rows.length,1);assert.equal(r.cards[0].templateId,'hierarchy');
 for(const id of ['radar','funnel','route','candlestick'])assert.equal(r.planner.templates.find(t=>t.id===id).matches,0);
});
