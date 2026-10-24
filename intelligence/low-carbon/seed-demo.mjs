// An explicit, labelled method example. Scores are assumptions, never project facts.
import {verifyLowCarbonEnvironment} from './runtime.mjs';
import fs from 'node:fs/promises';
await verifyLowCarbonEnvironment();
const base='http://127.0.0.1:3201/';
const login=await fetch(base+'api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:process.env.SITE_PASSWORD})});if(!login.ok)throw Error('LOGIN_FAILED');const cookie=login.headers.get('set-cookie').split(';')[0];
async function api(path,body){const r=await fetch(base+'api/'+path,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const v=await r.json();if(!r.ok)throw Error(v.message||v.error||'DEMO_REQUEST_FAILED');return v;}
const data=await api('data?projection=full'),source=data.documents.find(d=>d.url?.includes('norlights.com/news/'));
if(!source)throw Error('FRESH_CCUS_SOURCE_REQUIRED');
const labels=['管道接入情景','船舶接入情景','船管协同情景'],objectIds=['pipeline-scenario','ship-scenario','combined-scenario'];
const indicators=[{indicatorId:'flexibility',name:'接入灵活性（假设评分）',unit:'演示分'},{indicatorId:'complexity',name:'链条复杂性（假设评分）',unit:'演示分'},{indicatorId:'cost',name:'运行成本（假设评分）',unit:'演示分'}];
const matrix=[[5,4,3],[9,6,7],[8,8,6]],input={matrix,labels,objectIds,indicators,directions:['benefit','cost','cost'],weights:[.4,.3,.3],weightMethod:'manual',cellEvidence:matrix.flatMap((r,i)=>r.map((value,j)=>({objectId:objectIds[i],indicatorId:indicators[j].indicatorId,value,sourceRef:'低碳工作台固定方法演示；全部评分为假设，不是 Northern Lights 披露或工程测量。',period:'方法演示',nature:'demo',reviewStatus:'verified',reviewedBy:'平台方法验收'})))};
const request={schemaVersion:2,requestId:'lc-ccus-method-demo-v1',title:'CCUS接入路线比较（方法演示，全部评分为假设）',method:'topsis',taskType:'evaluation',templateId:'LC01',input,confirmed:true,scope:{topic:'lc_ccus_removal'},configuration:{functionalUnit:'三个假设接入情景的演示分',systemBoundary:'仅展示TOPSIS与权重敏感性；不核算真实成本、净减排或工程可行性'},review:{comparable:true,constraintsConfirmed:true,constraintScope:'scenario'},constraints:objectIds.map(objectId=>({id:'demo-'+objectId,objectId,status:'pass',reason:'仅核验固定评分矩阵及数值边界；真实安全、许可和能力未评估。'})),provenance:{description:'固定方法演示评分。项目背景原文独立采集于低碳库：'+source.title,unit:'演示分，全部为假设',period:'方法演示',urls:[source.url],author:'平台方法验收',reason:'检验输入、排序、权重变更、旧版复现与导出；不构成工程方案建议。'},researchNotes:{question:'如何用可追溯的假设评分比较CCUS接入情景？',methodRationale:'TOPSIS用于演示多准则相对比较；不替代工程经济或净减排核算。',findings:['项目背景来自低碳库独立抓取的 Northern Lights 原文；原文不支持本演示评分。','所有评分与权重均为固定演示假设，只检验方法和保存流程。'],limitations:'未评估实际工程安全、许可、源汇能力、真实成本与减排量；不构成方案建议。',nextSteps:'在取得同口径工程数据、硬约束和专家核定后，新建正式研究版本。'}};
const first=await api('strategy/studies',request),second=await api('strategy/studies',{...request,requestId:'lc-ccus-method-demo-v2',parentVersionId:first.id,parameterChanges:{parameterClass:'preference',values:{weights:[.2,.4,.4]},reason:'权重敏感性方法演示；保持评分事实输入不变。'}});
const replay=await api('strategy/studies/'+first.id+'/reproduce',{confirmed:true,requestId:'lc-ccus-method-demo-replay'});
if(JSON.stringify(replay.calculation)!==JSON.stringify(first.calculation))throw Error('DEMO_REPRODUCTION_FAILED');
const exported=await fetch(base+'api/strategy/studies/'+first.id+'/export',{headers:{Cookie:cookie}});if(!exported.ok)throw Error('DEMO_EXPORT_FAILED');
const result={firstVersion:first.id,secondVersion:second.id,replayVersion:replay.id,sourceDocumentId:source.id,reproduced:true,exported:true,allScores:'demonstration assumptions'};
await fs.writeFile('/opt/low-carbon/acceptance/research-example.json',JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));
