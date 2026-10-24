import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {allowedSharedSource,allowedSharedProvider,subscriptionWithLocalCounts,sharedRegistryPayload} from '../low-carbon/shared-policy.mjs';
test('shared gateway strips original article counts, task results and health data before the low-carbon process receives them',()=>{
 const result=sharedRegistryPayload('/api/subscriptions',{configured:true,list:[{id:'mp:1',enabled:true,payload:{name:'shared source',remoteId:'1',platform:'mp'},count:999,last_sync:'old sync'}],jobs:[{privateResult:'old job'}],classification:{accepted:999}});
 assert.equal(result.list[0].payload.name,'shared source');assert.equal(result.list[0].count,undefined);assert.equal(result.list[0].last_sync,undefined);assert.equal(result.jobs,undefined);assert.equal(result.classification,undefined);
 const rss=sharedRegistryPayload('/api/rss/sources',{list:[{id:1,name:'rss',alias:'https://example.org/feed',count:999,checkedAt:'old check',status:'ready'}]});assert.equal(rss.list[0].alias,'https://example.org/feed');assert.equal(rss.list[0].count,undefined);assert.equal(rss.list[0].checkedAt,undefined);
 assert.throws(()=>sharedRegistryPayload('/api/subscriptions',{}),/SCHEMA_CHANGED/);
});
test('shared subscription changes win immediately while article counts stay local',()=>{
 const current={id:'x:123',payload:{name:'new name',handle:'new-handle',remoteId:'123'},enabled:true,posts:true,present:true};
 const merged=subscriptionWithLocalCounts(current,{payload:{name:'old name'},enabled:false,present:false,count:12,ready:10});
 assert.deepEqual(merged.payload,current.payload);assert.equal(merged.enabled,true);assert.equal(merged.present,true);assert.equal(merged.posts,true);assert.equal(merged.count,12);assert.equal(merged.ready,10);
 assert.equal(subscriptionWithLocalCounts(current).count,0);
});
test('shared gateway allows source registration and raw provider reads, blocks business APIs and original sync',()=>{
 assert.equal(allowedSharedSource('/api/rss/sources','POST'),true);
 assert.equal(allowedSharedSource('/api/rss/sources/5','PATCH'),true);
 assert.equal(allowedSharedSource('/api/subscriptions/action','POST',{action:'subscribe'}),true);
 assert.equal(allowedSharedSource('/api/subscriptions/action','POST',{action:'sync'}),false);
 for(const p of ['/api/articles','/api/filters','/api/data','/api/push','/api/rss/sync','/api/subscriptions/items'])assert.equal(allowedSharedSource(p,'GET'),false);
 assert.equal(allowedSharedProvider('/open-api/subscriptions/5/articles','GET'),true);
 assert.equal(allowedSharedProvider('/open-api/subscriptions','DELETE'),false);
 assert.equal(allowedSharedProvider('/open-api/subscriptions/5/articles/extra','GET'),false);
});
const run=source=>{const r=spawnSync(process.execPath,['--input-type=module','-e',source],{cwd:new URL('../..',import.meta.url),env:{...process.env,APP_ID:'low-carbon'},encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
test('low-carbon classifies land and offshore evidence into six independent domains',()=>{
 const result=run(`import {compileRules,classifyRecord} from './intelligence/industry-classification.mjs';import {lowCarbonSeedRules} from './intelligence/low-carbon/taxonomy.mjs';const c=compileRules(lowCarbonSeedRules());console.log(JSON.stringify([
 ['CCUS与地质封存项目进展','二氧化碳捕集和地质封存项目进入实施阶段。'],
 ['钢厂余热回收改造','工厂回收高温余热用于蒸汽生产，提升能源利用效率。'],
 ['Green hydrogen project','Renewable energy powers green hydrogen production.'],
 ['Low-carbon steel materials','The low-carbon steel material was developed for industrial equipment.'],
 ['数字孪生优化工厂能碳管理','利用数字孪生与能耗在线监测实现智能能效诊断。'],
 ['全国碳市场规则发布','碳排放权交易及碳配额分配规则调整。']
 ].map(([title,content])=>classifyRecord({title,content},c))));`);
 assert.deepEqual(result.map(d=>d.primary),['lc_ccus_removal','lc_efficiency_recovery','lc_clean_energy_integration','lc_equipment_materials','lc_digital_carbon_management','lc_strategy_market']);assert.ok(result.every(d=>d.status==='accepted'));
});
test('ordinary energy, generic AI and recruitment do not become low-carbon evidence',()=>{
 const result=run(`import {compileRules,classifyRecord} from './intelligence/industry-classification.mjs';import {lowCarbonSeedRules} from './intelligence/low-carbon/taxonomy.mjs';const c=compileRules(lowCarbonSeedRules());console.log(JSON.stringify([
 {title:'深海油气项目增加原油产量',content:'平台常规钻井装备交付，新增油气储量。'},
 {title:'AI办公软件发布',content:'人工智能办公助手提升文档编辑效率。'},
 {title:'CCUS专业工程师招聘',content:'招聘碳捕集工程师，欢迎投递简历。'},
 {title:'普通工业材料供应',content:'新型通用材料投入批量生产。'},
 {title:'为祖国庆生！6000个福利红包等你来领！',content:'碳捕集与地质封存技术活动介绍。'},
 {title:'关于举办增量配电网及微电网培训的通知',content:'绿氢和源网荷储培训报名。'}].map(d=>classifyRecord(d,c))));`);
 assert.deepEqual(result.map(d=>d.status),['unmatched','unmatched','excluded','unmatched','excluded','excluded']);
});
test('grouped keywords must occur in one paragraph and disabled rules stay disabled',()=>{
 const result=run(`import {compileRules,classifyRecord} from './intelligence/industry-classification.mjs';const r={id:1,type:'include',topic:'lc_digital_carbon_management',title_keywords:[],content_keywords:[],require_all:true,groups:[['数字孪生'],['排放优化']]};console.log(JSON.stringify([
 classifyRecord({title:'技术研究',content:'数字孪生用于教学。\\n另一篇资料讨论排放优化。'},compileRules({rules:[r]})),
 classifyRecord({title:'技术研究',content:'数字孪生用于工厂排放优化。'},compileRules({rules:[r]})),
 classifyRecord({title:'数字孪生用于排放优化',content:''},compileRules({rules:[{...r,enabled:false}]}))]));`);
 assert.deepEqual(result.map(d=>d.status),['unmatched','accepted','unmatched']);
});
test('direct low-carbon server startup rejects the original PostgreSQL address before Store.init',()=>{
 const value=run(`process.env.DATABASE_URL='postgres://example@127.0.0.1:5432/knowledge_base';process.env.INTEL_DATABASE_URL=process.env.DATABASE_URL;process.env.INTEL_AUDIT_DATABASE_URL=process.env.DATABASE_URL;Object.assign(process.env,{LC_INSTANCE_ID:'guard-test',LC_DATA_ROOT:'/tmp/low-carbon-test',SITE_PASSWORD:'test',LC_SESSION_SECRET:'test'});try{await import('./intelligence/server.mjs');console.log(JSON.stringify({rejected:false}));process.exit(1);}catch(e){console.log(JSON.stringify({rejected:e.message==='LOW_CARBON_DATABASE_IDENTITY_REJECTED'}));}`);
 assert.equal(value.rejected,true);
});
test('low-carbon branding leaves browser module paths intact',()=>{
 const v=run(`import {brandText} from './intelligence/system-profile.mjs';console.log(JSON.stringify({value:brandText("import './object-browser.js'; const key='object-browser-recent:abc'; const title='行业数据洞察';")}));`);
 assert.match(v.value,/import '.\/object-browser\.js'/);assert.match(v.value,/lc-object-browser-recent:/);assert.match(v.value,/低碳产业与能效洞察/);
});
test('title and body rule fields stay separate and explicit body exclusions take precedence',()=>{
 const result=run(`import {compileRules,classifyRecord} from './intelligence/industry-classification.mjs';const r={id:1,type:'include',topic:'lc_ccus_removal',title_keywords:[],content_keywords:['碳封存']};console.log(JSON.stringify([
 classifyRecord({title:'碳封存项目',content:'正文尚未获取'},compileRules({rules:[r]})),
 classifyRecord({title:'项目进展',content:'这是碳封存项目的技术报告'},compileRules({rules:[r,{id:2,type:'exclude',content_keywords:['技术报告']}]}))]));`);
 assert.deepEqual(result.map(d=>d.status),['unmatched','excluded']);
});
test('all six domain drafts are complete bilingual dictionaries with richer body coverage',()=>{
 const rules=run(`import {lowCarbonSeedRules} from './intelligence/low-carbon/taxonomy.mjs';console.log(JSON.stringify(lowCarbonSeedRules().rules));`);
 const domains=rules.filter(r=>r.type==='include');assert.equal(domains.length,6);
 for(const r of rules){assert.ok(r.description.length>15);assert.ok(r.title_keywords.length>=60);assert.ok(r.content_keywords.length>r.title_keywords.length);assert.ok(r.content_keywords.length<=500);assert.equal(new Set(r.title_keywords.map(k=>k.toLowerCase())).size,r.title_keywords.length);assert.equal(new Set(r.content_keywords.map(k=>k.toLowerCase())).size,r.content_keywords.length);for(const field of [r.title_keywords,r.content_keywords]){assert.ok(field.filter(k=>/[\u4e00-\u9fff]/.test(k)).length>=25);assert.ok(field.filter(k=>/[a-z]/i.test(k)&&!/[\u4e00-\u9fff]/.test(k)).length>=25);}}
 assert.equal(rules.filter(r=>r.type==='context').length,1);assert.equal(rules.filter(r=>r.type==='exclude').length,1);
});
test('low-carbon context is editable, lexical and never assigns a domain by itself',()=>{
 const values=run(`import {compileRules,classifyRecord} from './intelligence/industry-classification.mjs';import {lowCarbonSeedRules} from './intelligence/low-carbon/taxonomy.mjs';const config=lowCarbonSeedRules(),ctx=config.rules.find(r=>r.type==='context');const doc={title:'碳封存项目',content:'技术报告。'};console.log(JSON.stringify([
 classifyRecord(doc,compileRules(config)),
 classifyRecord(doc,compileRules({rules:config.rules.map(r=>r===ctx?{...r,title_keywords:[],content_keywords:[]}:r)})),
 classifyRecord(doc,compileRules({rules:config.rules.map(r=>r===ctx?{...r,enabled:false}:r)})),
 classifyRecord({title:'低碳主题讨论',content:'尚无技术或治理事实。'},compileRules(config)),
 classifyRecord({title:'进展',content:'x'.repeat(1801)+' 碳封存'},compileRules(config))]));`);
 assert.deepEqual(values.map(v=>v.status),['accepted','unmatched','unmatched','unmatched','unmatched']);assert.ok(values[0].context.hits.some(h=>h.keyword==='碳封存'));
});
test('expanded bilingual terminology covers technical body phrases across all six domains',()=>{
 const values=run(`import {compileRules,classifyRecord} from './intelligence/industry-classification.mjs';import {lowCarbonSeedRules} from './intelligence/low-carbon/taxonomy.mjs';const c=compileRules(lowCarbonSeedRules());console.log(JSON.stringify([
 ['技术研究进展','项目通过固体吸附碳捕集与矿物碳化实现永久碳封存。'],
 ['Carbon storage demonstration','A saline aquifer storage site monitors CO2 plume migration.'],
 ['工业能效提升','工厂开展冷凝水回收与凝结水回收，降低能源消耗。'],
 ['Industrial energy efficiency','The facility implements condensate recovery and flash steam recovery.'],
 ['清洁供能项目','海岛采用可再生微电网和风电储能协同。'],
 ['Renewable energy development','An island hybrid microgrid integrates renewable power.'],
 ['绿色装备研发','工业热泵与低再生能耗吸收剂研发取得进展。'],
 ['Green steel materials','The team develops a low-embodied-carbon material and calcined clay cement.'],
 ['能碳平台升级','新增碳数据校验和排放因子数据库。'],
 ['Digital carbon management','The software supports carbon data validation and scope 3 emissions accounting.'],
 ['低碳项目投资机制','研究转型金融目录、碳差价合约和低碳项目融资。'],
 ['Climate policy reforms','The new carbon contracts for difference support industrial decarbonisation.']
 ].map(([title,content])=>classifyRecord({title,content},c))));`);
 assert.ok(values.every(v=>v.status==='accepted'),JSON.stringify(values));assert.deepEqual(values.map(v=>v.primary),['lc_ccus_removal','lc_ccus_removal','lc_efficiency_recovery','lc_efficiency_recovery','lc_clean_energy_integration','lc_clean_energy_integration','lc_equipment_materials','lc_equipment_materials','lc_digital_carbon_management','lc_digital_carbon_management','lc_strategy_market','lc_strategy_market']);
});
test('Chinese and English reverse rules apply to every domain while carbon finance stays relevant',()=>{
 const values=run(`import {compileRules,classifyRecord} from './intelligence/industry-classification.mjs';import {lowCarbonSeedRules,lowCarbonTopics} from './intelligence/low-carbon/taxonomy.mjs';const c=compileRules(lowCarbonSeedRules());console.log(JSON.stringify([
 ...lowCarbonTopics.map(t=>classifyRecord({title:'招聘 '+t.titleKeywords[0],content:t.titleKeywords[0]+'技术资料'},c)),
 ...lowCarbonTopics.map(t=>classifyRecord({title:'We are hiring '+t.titleKeywords.find(k=>/^[a-z]/i.test(k)),content:'Submit your resume to apply for this position.'},c)),
 classifyRecord({title:'全国碳市场价格与低碳项目投资研究',content:'通过碳差价合约和绿色金融降低减排成本。'},c),
 classifyRecord({title:'Carbon pricing and transition finance',content:'The carbon market supports decarbonization investment.'},c),
 classifyRecord({title:'普通软件发布',content:'This tool manages sales.\\n相关阅读\\n碳封存与绿色金融研究'},c),
 classifyRecord({title:'Carbon accounting stock picks',content:'Stock trading recommendation and earnings per share.'},c),
 classifyRecord({title:'【赞助内容】CCUS项目宣传',content:'carbon capture and carbon storage.'},c)]));`);
 assert.ok(values.slice(0,12).every(v=>v.status==='excluded'));assert.deepEqual(values.slice(12).map(v=>v.status),['accepted','accepted','unmatched','excluded','excluded']);
});
test('HTML paragraphs cannot be combined into an artificial low-carbon match',()=>{
 const values=run(`import {compileRules,classifyRecord} from './intelligence/industry-classification.mjs';const c=compileRules({rules:[{type:'include',topic:'lc_digital_carbon_management',require_all:true,groups:[['数字孪生'],['排放优化']]}]});console.log(JSON.stringify([
 classifyRecord({title:'研究',content:'<p>数字孪生用于教学</p><p>另一项研究讨论排放优化</p>'},c),
 classifyRecord({title:'研究',content:'<p>数字孪生用于排放优化</p>'},c),
 classifyRecord({title:'研究',content:'数字孪生用于教学\\u2028另一项研究讨论排放优化'},c)]));`);
 assert.deepEqual(values.map(v=>v.status),['unmatched','accepted','unmatched']);
});
