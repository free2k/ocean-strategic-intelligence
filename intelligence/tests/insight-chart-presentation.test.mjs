import test from 'node:test';
import assert from 'node:assert/strict';
import {mountChartRotation} from '../quant-preview/chart-rotation.js';
import {chartCaption} from '../quant-preview/chart-caption.js';
import {serveQuant} from '../quant-routes.mjs';

function clock(){
 let now=0,id=0;const tasks=new Map();
 return {
  schedule(fn,delay){const key=++id;tasks.set(key,{fn,at:now+delay});return key;},
  cancel(key){tasks.delete(key);},
  advance(ms){const end=now+ms;while(true){const next=[...tasks].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;now=next[1].at;tasks.delete(next[0]);next[1].fn();}now=end;},
  pending:()=>tasks.size
 };
}
function fixture(time=clock(),page=Object.assign(new EventTarget(),{hidden:false})){
 const article=Object.assign(new EventTarget(),{ownerDocument:page,focused:false,matches:()=>false,querySelector(){return this.focused?{}:null;}});
 const selected=[],choices=['line','bar','heatmap','boxplot'];let value=choices[0];
 const rotation=mountChartRotation(article,{views:()=>choices,current:()=>value,select:type=>{value=type;selected.push(type);},schedule:time.schedule,cancel:time.cancel});
 return {article,page,time,selected,choices,rotation,get value(){return value;}};
}
const pointer=(article,type,pointerType='mouse')=>article.dispatchEvent(Object.assign(new Event(type),{pointerType}));

test('visible charts rotate every 2500ms, wrap through supported views, and restart after becoming visible',()=>{
 const f=fixture();f.time.advance(5000);assert.deepEqual(f.selected,[]);
 f.rotation.setVisible(true);f.time.advance(2499);assert.deepEqual(f.selected,[]);
 f.time.advance(1);assert.equal(f.value,'bar');f.time.advance(7500);assert.deepEqual(f.selected,['bar','heatmap','boxplot','line']);
 f.rotation.setVisible(false);f.time.advance(10000);assert.equal(f.value,'line');assert.equal(f.time.pending(),0);
 f.rotation.setVisible(true);f.time.advance(2499);assert.equal(f.value,'line');f.time.advance(1);assert.equal(f.value,'bar');f.rotation.dispose();
});
test('hover pauses only the corresponding card and leaving starts a full new interval',()=>{
 const time=clock(),a=fixture(time),b=fixture(time);a.rotation.setVisible(true);b.rotation.setVisible(true);
 time.advance(2000);pointer(a.article,'pointerenter');time.advance(5500);assert.deepEqual(a.selected,[]);assert.equal(b.selected.length,3);
 pointer(a.article,'pointerleave');time.advance(2499);assert.equal(a.value,'line');time.advance(1);assert.equal(a.value,'bar');
 a.rotation.dispose();b.rotation.dispose();assert.equal(time.pending(),0);
});
test('manual changes, hidden pages, keyboard focus and disposal cannot leave stale rotation timers',async()=>{
 const f=fixture();f.rotation.setVisible(true);f.time.advance(2400);f.rotation.reset();f.time.advance(2499);assert.deepEqual(f.selected,[]);f.time.advance(1);assert.equal(f.value,'bar');
 f.page.hidden=true;f.page.dispatchEvent(new Event('visibilitychange'));f.time.advance(5000);assert.equal(f.value,'bar');
 f.page.hidden=false;f.page.dispatchEvent(new Event('visibilitychange'));f.article.focused=true;f.article.dispatchEvent(new Event('focusin'));f.time.advance(5000);assert.equal(f.value,'bar');
 f.article.focused=false;f.article.dispatchEvent(new Event('focusout'));await Promise.resolve();f.time.advance(2500);assert.equal(f.value,'heatmap');
 f.rotation.dispose();f.rotation.setVisible(true);pointer(f.article,'pointerleave');f.page.dispatchEvent(new Event('visibilitychange'));f.time.advance(10000);assert.equal(f.value,'heatmap');assert.equal(f.time.pending(),0);
});
test('touch pointer entry does not permanently pause a card and one-view cards never schedule rotation',()=>{
 const f=fixture();f.rotation.setVisible(true);pointer(f.article,'pointerenter','touch');f.time.advance(2500);assert.equal(f.value,'bar');f.rotation.dispose();
 const single=fixture();single.choices.splice(1);single.rotation.setVisible(true);single.time.advance(10000);assert.deepEqual(single.selected,[]);assert.equal(single.time.pending(),0);single.rotation.dispose();
});
test('BOEM captions name the agency, publication scope, document class and counting unit without altering data',()=>{
 for(const [kind,documentClass] of [['notice','Notice'],['rule','Rule'],['proposed-rule','Proposed Rule']]){
  const card={seriesId:'fr-boem-'+kind,title:'旧标题',unit:'份',rows:[{period:'2026-01',value:0}]},before=structuredClone(card),text=chartCaption(card);
  assert.match(text.title,/美国 BOEM 海上能源管理/);assert.match(text.description,/美国海洋能源管理局.*Federal Register/);assert.ok(text.description.includes(documentClass));assert.match(text.description,/文件编号.*单位：份/);assert.deepEqual(card,before);
 }
 const oil=chartCaption({seriesId:'sodir-troll-oil',unit:'百万标准立方米'}),gas=chartCaption({seriesId:'sodir-troll-gas',unit:'十亿标准立方米'});
 assert.match(oil.title,/挪威 TROLL 油气田.*净原油/);assert.match(gas.title,/净天然气/);assert.match(oil.description,/百万标准立方米/);assert.match(gas.description,/十亿标准立方米/);
 assert.match(chartCaption({seriesId:'transocean-utilization',title:'全船队平均平台利用率',unit:'%'}).title,/Transocean/);
 assert.equal(chartCaption({title:'用户自定义指标',content:'来源给出的原始口径。更多信息。'}).title,'用户自定义指标');
});
test('both new browser modules are served by the production asset route',async()=>{
 for(const filename of ['chart-caption.js','chart-rotation.js']){
  const headers={},res={setHeader(key,value){headers[key]=value;},end(bytes){this.bytes=bytes;}};
  assert.equal(await serveQuant({method:'GET'},res,new URL('http://localhost/quant/'+filename),{},new URL('../',import.meta.url).pathname),true);
  assert.equal(headers['Content-Type'],'text/javascript; charset=utf-8');assert.ok(res.bytes.length>100);
 }
});
