import test from 'node:test';
import assert from 'node:assert/strict';
import {attachPublishedRules,snapshotRules} from '../published-rules.mjs';
import {compileRules,classifySnapshot} from '../industry-classification.mjs';
import {serveQuant} from '../quant-routes.mjs';
const config={rules:[{id:1,type:'include',topic:'海洋装备',content_keywords:['船舶']},{id:2,type:'exclude',content_keywords:['招聘']}]};
test('targeted applied jobs publish their immutable config and version',()=>{
 const data={};attachPublishedRules(data,{id:7,config,version:compileRules(config).version,scope:{targeted:true}});
 assert.equal(snapshotRules(data),config);assert.equal(data.industryRulePublication.jobId,7);
 assert.equal(data.industryRulePublication.scope.targeted,true);
 const rows=classifySnapshot({documents:[{title:'海洋船舶报道',content:'海洋船舶报道',industry:{status:'excluded',version:'old',negative:[{keyword:'报道'}]}}]},config);
 assert.equal(rows.documents[0].industry.status,'accepted');assert.deepEqual(rows.documents[0].industry.negative,[]);
});
test('missing and inconsistent versions fail explicitly',()=>{
 assert.throws(()=>snapshotRules({}),/缺少/);assert.throws(()=>attachPublishedRules({},{}),/缺失/);
 const historical={};attachPublishedRules(historical,{config,version:'database-job-version'});assert.equal(historical.industryRulePublication.version,'database-job-version');assert.equal(historical.industryRulePublication.classifierVersion,compileRules(config).version);
 const data={};attachPublishedRules(data,{config});data.industryRuleVersion='old';assert.throws(()=>snapshotRules(data),/不一致/);
});
test('catalog never reads a legacy rule file when snapshot rules are absent',async()=>{
 const result={},res={setHeader(){},writeHead(status){result.status=status;},end(body){result.body=JSON.parse(body);}};
 await serveQuant({method:'GET'},res,new URL('http://test/quant/api/catalog'),{},'/nonexistent');
 assert.equal(result.status,503);assert.equal(result.body.code,'CLASSIFICATION_RULES_UNAVAILABLE');
});
