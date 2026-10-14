import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankCountries} from '../public/country-ranking.mjs';
test('country picker prioritizes covered countries, major countries, then coverage without mutating input',()=>{
 const input=[{code:'FJ',name:'斐济'},{code:'US',name:'美国'},{code:'NO',name:'挪威'},{code:'CN',name:'中国'},{code:'PT',name:'葡萄牙'}];
 assert.deepEqual(rankCountries(input,{NO:3,PT:8,CN:1}).map(c=>c.code),['CN','NO','PT','US','FJ']);
 assert.equal(input[0].code,'FJ');
 assert.deepEqual(rankCountries(input).slice(0,3).map(c=>c.code),['CN','US','NO']);
});
