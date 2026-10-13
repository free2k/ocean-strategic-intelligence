import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveSignals,renderChangeSignals,renderSignalEvidence} from '../public/change-signals.js';
const doc=(id,publishedAt,title='普通资讯',sourceId='a')=>({id,title,publishedAt,sourceId,url:'https://example.test/'+id});
test('compares completed Beijing days, deduplicates and excludes today and invalid dates',()=>{
 const d=doc('a','2026-10-10T01:00:00Z','海上风电项目');
 const r=deriveSignals({generatedAt:'2026-10-13T03:00:00Z',documents:[d,{...d,id:'copy'},doc('today','2026-10-12T16:00:00Z'),doc('invalid','bad'),doc('old','2026-10-05T15:59:59Z','海上风电旧项目')]});
 assert.equal(r.current,1);assert.equal(r.before,1);assert.equal(r.duplicateCount,1);assert.equal(r.excludedToday,1);assert.equal(r.missingDates,1);
});
test('increased counts with falling share do not become a theme surge',()=>{
 const documents=[...Array.from({length:10},(_,i)=>doc('p'+i,'2026-10-02T01:00:00Z',i<5?'签约项目'+i:'其他资料'+i)),...Array.from({length:40},(_,i)=>doc('c'+i,'2026-10-10T01:00:00Z',i<10?'签约新项目'+i:'普通新闻'+i,i%2?'a':'b'))];
 const r=deriveSignals({generatedAt:'2026-10-13T03:00:00Z',documents});const signal=r.signals.find(s=>s.name==='项目签约与订单');assert.equal(signal.label,'持续观察');assert.match(signal.sentence,/占比下降/);assert.equal(signal.now.length,10);assert.equal(signal.was.length,5);
});
test('zero baseline is not an infinite growth percentage and evidence is escaped',()=>{
 const d={generatedAt:'2026-10-13T03:00:00Z',sources:[],documents:[doc('x','2026-10-11T01:00:00Z','海底电缆 <script>'),doc('y','2026-10-12T01:00:00Z','海缆建设')]};
 assert.equal(deriveSignals(d).signals[0].label,'本窗口新见');const html=renderChangeSignals(d);assert(!html.includes('<script>'));assert(!html.includes('Infinity'));assert(renderSignalEvidence(d,7,deriveSignals(d).signals[0].name).includes('data-document="x"')); assert(!renderSignalEvidence(d,7,deriveSignals(d).signals[0].name).includes('<script>')); 
});
