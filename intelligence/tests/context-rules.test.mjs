import test from 'node:test';import assert from 'node:assert/strict';
import {compileRules,classifyRecord} from '../industry-classification.mjs';
const include={id:1,type:'include',topic:'宏观政策',title_keywords:['政策'],content_keywords:[]};
const context={id:2,type:'context',title_keywords:['近岸'],content_keywords:['offshore'],enabled:true};
const run=(title,content='',ctx=context,extra=[])=>classifyRecord({title,content},compileRules({rules:[include,ctx,...extra]}));
test('Custom context only opens scope, never assigns an industry alone',()=>{
 assert.equal(run('近岸政策').status,'accepted');assert.equal(run('近岸消息').status,'unmatched');
 assert.equal(run('海洋政策').status,'unmatched');
 assert.equal(run('政策','OFFSHORE development').status,'accepted');
 assert.equal(run('政策','not_offshoreish').status,'unmatched');
 assert.equal(run('政策','x'.repeat(1801)+' offshore').status,'unmatched');
 assert.equal(run('近岸政策','',context,[{type:'exclude',title_keywords:['政策']}]).status,'excluded');
});
test('Empty and disabled context never silently restore legacy defaults',()=>{
 assert.equal(run('海洋政策','offshore',{...context,title_keywords:[],content_keywords:[]}).status,'unmatched');
 assert.equal(run('近岸政策','offshore',{...context,enabled:false}).status,'unmatched');
 assert.equal(classifyRecord({title:'海洋政策'},compileRules({rules:[include]})).status,'accepted');
 assert.notEqual(compileRules({rules:[context]}).version,compileRules({rules:[{...context,content_keywords:['seabed']}]}).version);
 assert.equal(run('政策','offshore').context.hits[0].keyword,'offshore');
});
