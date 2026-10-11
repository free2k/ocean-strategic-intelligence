import test from 'node:test';import assert from 'node:assert/strict';
import {connectionDirection,countryMap,normalizeWorld} from '../public/country-map.js';
const pair={from:'NO',to:'SE',eventIds:['event'],count:1};
const data=quote=>({countryOptions:[{code:'NO',name:'挪威'},{code:'SE',name:'瑞典'}],events:[{id:'event',documentId:'doc',evidenceIds:['proof']}],evidence:[{id:'proof',documentId:'doc',quote}],countries:[],connections:[]});
test('regions without ISO codes receive distinct stable selection keys',()=>{
 const normalized=normalizeWorld([{code:'-99',name:'A'},{code:'-99',name:'B'},{code:'CN',name:'中国'}]);assert.notEqual(normalized[0].code,normalized[1].code);assert.equal(normalized[2].code,'CN');
});
test('evidence determines reverse direction, not alphabetical order',()=>{
 const d=connectionDirection(pair,data('CO2 will be transported from Sweden to Norway.'));
 assert.equal(d.from,'SE');assert.equal(d.to,'NO');assert.equal(d.evidence[0].evidenceId,'proof');
 assert.equal(connectionDirection(pair,data('二氧化碳从瑞典运输至挪威。')).from,'SE');
});
test('co-occurrence, negation and mismatched evidence cannot imply direction',()=>{
 for(const quote of ['Sweden and Norway cooperate on CO2 transport.','CO2 will not be transported from Sweden to Norway.','从瑞典到挪威的企业进行讨论。'])assert.equal(connectionDirection(pair,data(quote)),null);
 const wrong=data('CO2 is transported from Sweden to Norway.');wrong.evidence[0].documentId='other';assert.equal(connectionDirection(pair,wrong),null);
});
test('conflicting directions keep the map association undirected',()=>{
 const d=data('CO2 is transported from Sweden to Norway; CO2 is transported from Norway to Sweden');assert.equal(connectionDirection(pair,d),null);
});
test('every map polygon is selectable and empty selected country remains named',()=>{
 const html=countryMap(data(''),[{code:'IS',name:'冰岛',path:'M0 0L10 0L10 10Z'}],'IS');
 assert.match(html,/selected-country/);assert.match(html,/当前国家：<strong>冰岛/);assert.match(html,/当前筛选范围暂无数据/);assert.match(html,/aria-pressed="true"/);assert.match(html,/tabindex="0"/);
});
