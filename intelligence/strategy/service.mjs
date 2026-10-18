import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {compute,StrategyError,seriesRows,ENGINE_VERSION} from './engine.mjs';
import {compute as computeV1} from './engines/1.0.0.mjs';
import {countries,relationTypes} from '../core.mjs';
import {buildInputOptions} from './input-options.mjs';
import {standardTopics} from '../industry-topics.mjs';
import {classifyRecommendation,classifyTemplate,buildDiscovery} from './discovery.mjs';
import {normalizeCountryFilter} from '../country-filter.mjs';
import {getQuantCatalog} from '../quant-routes.mjs';
import {validateRequest,invalid,matrixMethods,isObject} from './contracts.mjs';
import {checkStudyReadiness,matchMethods,templateReadiness,validateParameterChanges,taskNames} from './governance.mjs';
import {MethodAdvisor,verifyMethodSelection,validateAdviceRequest,ADVISOR_VERSION} from './method-advisor.mjs';
import {StrategyRepository,digest} from './repository.mjs';
export {StrategyRepository};
const load=async name=>JSON.parse(await fs.readFile(new URL('./'+name,import.meta.url),'utf8'));
export const methodCatalog=await load('methods.json');
const templates=await load('specs/research-templates.json'),governance=await load('specs/parameter-governance.json'),indicators=await load('specs/indicator-dictionary.json');
const advisors=new WeakMap();
function advisorFor(store,client,model){let a=advisors.get(store);if(!a||a.client!==client||a.model!==model){a=new MethodAdvisor({client,model,methods:methodCatalog.methods});advisors.set(store,a);}return a;}
const engines={'1.0.0':computeV1,'1.1.0':compute};
export const safeScope=input=>Object.fromEntries(['topic','country','sourceId','from','to'].map(k=>[k,k==='country'?normalizeCountryFilter(input?.[k]):input?.[k]||'']));
function usableSeries(s){try{seriesRows({rows:s.rows});return !!s.unit;}catch{return false;}}
export function recommendations(catalog){
 const items=[];
 for(const s of catalog.series||[]){let rows;try{rows=seriesRows({rows:s.rows});}catch{continue;}if(!s.unit)continue;
 const continuous=rows.every((x,i)=>!i||x.t===rows[i-1].t+1),full=rows.every(x=>!x.partial);
 items.push({id:'growth:'+s.id,title:s.name+'：近期变化与历史基期比较',method:'growth',taskType:'statistics',dataset:{kind:'series',id:s.id},status:'ready',engineStatus:'accepted',dataStatus:'ready',reason:`当前有${rows.length}期同口径记录、明确单位和统计期；提交前仍需核定范围。`,gaps:'缺失基期返回空值；不能证明变化原因。',coverage:{n:rows.length,from:rows[0].period,to:rows.at(-1).period,unit:s.unit},priority:rows.length>=13?1:2});
 if(rows.length>=6&&continuous&&full)items.push({id:'trend:'+s.id,title:s.name+'：已观测趋势与阶段研判',method:'trend',taskType:'statistics',dataset:{kind:'series',id:s.id},status:'ready',engineStatus:'accepted',dataStatus:'ready',reason:`${rows.length}个连续完整统计期，满足描述性拟合的基础条件。`,gaps:'不作未来预测；预测模型需时间外验证。',coverage:{n:rows.length,from:rows[0].period,to:rows.at(-1).period,unit:s.unit},priority:2});
 }
 for(const item of catalog.industries||[]){if(!item.articles&&!item.observations&&!item.series?.length)continue;items.push({id:'matrix:'+item.topic,title:item.name+'：技术路线／项目综合评价',method:'entropy-topsis',taskType:'evaluation',industryIds:[item.topic],status:'needs-data',engineStatus:'accepted',dataStatus:'needs-data',reason:`已有${item.articles}篇资料与${item.observations}条指标线索，可寻找评价依据。`,gaps:'尚未证明同对象、同期间、同口径完整矩阵；须补齐来源、单位和方向。',priority:3});}
 items.push({id:'planned:milp',title:'风浪光储互补与容量配置研究方案',method:'milp',taskType:'optimization',industryIds:['多能融合'],status:'engine-pending',engineStatus:'planned',dataStatus:'needs-data',reason:'该问题需要同期逐时资源、约束与专用优化求解器。',gaps:'逐时数据、可行域和优化引擎待接入；仅可建立方案。',priority:4});
 return items.sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id)).map(item=>classifyRecommendation(item,catalog));
}

function numericFacts(x){const out={};for(const k of ['matrix','values','other','cashflows','baseline','labels','objectIds'])if(x[k]!==undefined)out[k]=x[k];if(x.indicators)out.indicators=x.indicators.map(({indicatorId,name,unit})=>({indicatorId,name,unit}));if(x.rows)out.rows=x.rows.map(({period,value,partial})=>({period,value,partial:!!partial}));if(x.edges)out.edges=x.edges.map(({from,to,type})=>({from,to,type}));return out;}
function evidenceFor(x,p){const {checkedAt,...source}=p;return {provenance:source,cells:x.cellEvidence||[],rows:x.rows?.map(({period,sourceUrl})=>({period,sourceUrl})),edges:x.edges?.map(({from,to,evidence})=>({from,to,evidence}))};}
function configurationFor(r,input,engineVersion){return {method:r.method,engineVersion,scope:safeScope(r.scope),configuration:r.configuration||{},constraints:r.constraints||[],directions:input.directions,weights:input.weights,weightMethod:input.weightMethod,judgments:input.judgments,scan:input.scan,rate:input.rate,shocks:input.shocks,window:input.window,completeUniverse:input.completeUniverse};}
function changes(a,b,prefix='',out=[]){if(digest(a??null)===digest(b??null))return out;if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const k of new Set([...Object.keys(a),...Object.keys(b)])){if(out.length>=100)break;changes(a[k],b[k],prefix?prefix+'.'+k:k,out);}}else out.push({field:prefix,before:a??null,after:b??null});return out;}

export function buildStudy(catalog,request,previous,actor={id:'authenticated-researcher'}){
 validateRequest(request);
 const method=methodCatalog.methods.find(m=>m.id===request.method);
 if(!method||method.status!=='ready')invalid('所选方法尚无已验收引擎，请查看方法库的数据与接入要求',[],400,'ENGINE_UNAVAILABLE');
 if(previous&&previous.method.id!==method.id)invalid('版本复算须保持方法一致；换方法请新建研究用于交叉比较');
 if(request.confirmed!==true)invalid('请确认研究口径、来源和模型前提',[{field:'confirmed',message:'核定后方可计算'}]);
 if(request.studyId&&!previous)invalid('已有主题须指定父版本，不按标题合并');
 if(previous&&request.studyId&&request.studyId!==(previous.studyId||previous.id))invalid('研究主题与父版本不一致',[],409,'STUDY_CONFLICT');
 if(request.runMode==='frozen'&&!previous)invalid('旧输入重现须指定已有版本');
 if(previous&&request.constraints===undefined)request={...request,constraints:previous.constraints||[]};
 let input,provenance,dataset=request.dataset||null,engineVersion=ENGINE_VERSION;
 if(request.runMode==='frozen'){
   input=structuredClone(previous.input);provenance=structuredClone(previous.provenance);dataset=previous.dataset;engineVersion=previous.engineVersion;
   if(!engines[engineVersion])invalid('旧算法包不可用，不能用新算法伪称重现',[],409,'ENGINE_VERSION_UNAVAILABLE');
 }else if(dataset){
   if(!['describe','growth','cagr','trend','moving'].includes(method.id))invalid('所选方法不接受单一统计序列');
   const s=(catalog.series||[]).find(s=>s.id===dataset.id);
   if(!s||!usableSeries(s))invalid('当前筛选下该序列不可用或口径不完整',[{field:'dataset',message:'检查冻结范围、来源、统计期及单位'}]);
   input={rows:s.rows.map(r=>({period:r.period,value:r.value,partial:!!r.partial,sourceUrl:r.sourceUrl||s.sourceUrl||''})),values:s.rows.map(r=>r.value),window:request.input?.window??3};
   provenance={kind:'platform-series',seriesId:s.id,name:s.name,unit:s.unit,frequency:s.frequency,sourceId:s.sourceId||null,url:s.sourceUrl||'',note:s.note||'',checkedAt:s.checkedAt||null,period:s.rows[0].period+'—'+s.rows.at(-1).period,parameterClass:'fact'};
 }else{
   if(!isObject(request.input))invalid('请提供结构化输入');input=structuredClone(request.input);
   const p=request.provenance;if(!p?.description?.trim()||!p.unit?.trim()||!p.period?.trim())invalid('人工输入须填写来源说明、单位/口径和研究期间',[{field:'provenance',message:'来源、单位和期间必填'}]);
   provenance={kind:'researcher-confirmed',description:p.description,unit:p.unit,period:p.period,urls:p.urls||[],author:p.author||'',reason:p.reason||'',verification:'研究人员声明；系统未自动核实输入真实性'};
 }
 if(request.engineVersion&&request.engineVersion!==engineVersion)invalid('请求的算法版本与本次执行不一致',[],409,'ENGINE_VERSION_CONFLICT');
 let audit=null;
 if(request.parameterChanges){
   if(!previous)invalid('参数修改须引用原版本');
   audit=validateParameterChanges(previous,request.parameterChanges,actor);
   if(audit.parameterClass==='constraint')request={...request,configuration:{...(previous.configuration||{}),...audit.values}};
   else input={...input,...audit.values};
 }
 if(previous&&(audit&&audit.parameterClass!=='constraint'||['preference','scenario'].includes(request.changeClass))&&digest(numericFacts(input))!==digest(numericFacts(previous.input)))invalid('偏好或情景修改不能改写事实输入；请创建独立的数据核定版本',[],403,'PARAMETER_READ_ONLY');
 const configuration=request.runMode==='frozen'?(previous.configuration||{}):(request.configuration||previous?.configuration||{});
 if(previous&&request.runMode!=='frozen'&&(digest(configuration)!==digest(previous.configuration||{})||digest(request.constraints||[])!==digest(previous.constraints||[]))&&!request.revisionReason?.trim()&&!audit?.reason)invalid('功能单位或系统边界已改变，请填写口径修订依据并另建配置版本',[{field:'revisionReason',message:'填写边界修订与审核依据'}]);
 const readiness=checkStudyReadiness({...request,input},methodCatalog.methods);
 if(!readiness.canExecute)invalid(readiness.status==='not-applicable'?'硬约束或研究问题不适用，禁止排序':'数据与来源仍待核定，不能计算',readiness.fieldErrors.length?readiness.fieldErrors:[{field:'confirmed',message:readiness.missingFields.join('；')}],400,readiness.status==='not-applicable'?'NOT_APPLICABLE':'REVIEW_REQUIRED');
 if(matrixMethods.has(method.id)&&input.cellEvidence){
   for(const indicator of input.indicators){const cells=input.cellEvidence.filter(e=>e.indicatorId===indicator.indicatorId);if(new Set(cells.map(e=>e.nature)).size>1||new Set(cells.map(e=>e.period)).size>1)invalid('同一指标的对象期间或数值性质不可比，请分开研究',[{field:'input.cellEvidence',indicatorId:indicator.indicatorId,message:'实际/计划/估计/专家/演示与期间须逐项核定'}]);}
 }
 const methodSelection=request.runMode==='frozen'?(previous.methodSelection||null):verifyMethodSelection(request,catalog);
 // Frozen calculation uses an archived executable engine and its original input.
 const calculation=engines[engineVersion](method.id,input),scope=safeScope(request.runMode==='frozen'?previous.scope:request.scope),config=configurationFor({...request,scope,configuration},input,engineVersion);
 const numericInputHash=digest(numericFacts(input)),evidenceHash=digest(evidenceFor(input,provenance)),configHash=digest(config),id=randomUUID();
 const record={id,versionId:id,studyId:previous?.studyId||previous?.id||randomUUID(),parentId:previous?.id||null,parentVersionId:previous?.id||null,title:request.title.trim(),kind:'strategic-quantitative-study',schemaVersion:2,methodSelection,status:'已计算，待专业审阅',createdAt:new Date().toISOString(),taskType:request.taskType||null,templateId:request.templateId||previous?.templateId||null,method:{id:method.id,name:method.name,family:method.family,caution:method.caution},methodCatalogVersion:methodCatalog.version,engineVersion,parameterVersion:'cfg-'+configHash.slice(0,16),parameters:{facts:{parameterClass:'fact',snapshotRef:'inputSnapshot',numericInputHash},preferences:{parameterClass:'preference',weights:input.weights,weightMethod:input.weightMethod,judgments:input.judgments,author:provenance.author||actor.id,reason:provenance.reason||'按已确认方法规则生成'},scenarios:{parameterClass:'scenario',rate:input.rate,shocks:input.shocks,reason:provenance.reason||null},decisions:{parameterClass:'decision',engineStatus:'planned'},constraints:{parameterClass:'constraint',configuration,checks:request.constraints||[]},output:{parameterClass:'output',resultRef:'calculation.result',readonly:true}},normalization:calculation.result.normalization||'不适用',configuration,constraints:request.runMode==='frozen'?(previous.constraints||[]):request.constraints||[],review:{...(request.review||{}),declaredBy:actor.id,declaredAt:new Date().toISOString(),confirmed:true},input,inputSnapshot:input,provenance,sourceRefs:input.cellEvidence||input.rows?.map(r=>({period:r.period,sourceRef:r.sourceUrl,reviewStatus:'researcher-confirmed'}))||[{sourceRef:provenance.description||provenance.url,period:provenance.period}],dataset,scope,numericInputHash,evidenceHash,configHash,dataHash:digest({input,provenance:{...provenance,checkedAt:undefined},scope}),snapshotAt:catalog.snapshotAt||null,insightRevision:catalog.insightRevision||null,calculation,diagnostics:{readiness,notes:calculation.notes,uncertainty:{weightSensitivity:!!calculation.result.perturbations,ninePointScan:!!calculation.result.scan,scenario:method.id==='scenario',inputError:'未建模',modelUncertainty:'未建模'}},runMode:request.runMode||'current',revisionReason:request.revisionReason||audit?.reason||null,parameterAudit:audit};
 record.parameters=JSON.parse(JSON.stringify(record.parameters));
 if(previous){const sameBasis=digest(previous.configuration||{})===digest(configuration);record.comparison={previousId:previous.id,dataChanged:previous.numericInputHash?previous.numericInputHash!==numericInputHash:previous.dataHash!==record.dataHash,numericChanged:previous.numericInputHash?previous.numericInputHash!==numericInputHash:digest(numericFacts(previous.input))!==numericInputHash,evidenceChanged:previous.evidenceHash?previous.evidenceHash!==evidenceHash:digest(evidenceFor(previous.input,previous.provenance))!==evidenceHash,configChanged:(previous.configHash||digest(configurationFor({...previous,method:previous.method.id},previous.input,previous.engineVersion)))!==configHash,methodChanged:previous.method.id!==method.id,engineChanged:previous.engineVersion!==engineVersion,resultComparable:sameBasis,comparisonWarning:sameBasis?null:'功能单位或系统边界改变；两版不可视为同口径得分比较',previousHash:previous.dataHash,currentHash:record.dataHash,previousMethod:previous.method.id,inputDifferences:changes(numericFacts(previous.input),numericFacts(input)),evidenceDifferences:changes(evidenceFor(previous.input,previous.provenance),evidenceFor(input,provenance)),configurationDifferences:changes(configurationFor({...previous,method:previous.method.id},previous.input,previous.engineVersion),config),resultDifferences:sameBasis?changes(previous.calculation.result,calculation.result):[],previousResult:sameBasis?previous.calculation.result:null};}
 return record;
}

export function exportMarkdown(r){return `# ${r.title.replace(/[\r\n]/g,' ')}\n\n状态：${r.status}\n\n研究主题：${r.studyId||r.id}\n\n版本：${r.id}；父版本：${r.parentVersionId||r.parentId||'无'}\n\n方法：${r.method.name}；引擎：${r.engineVersion}；参数版本：${r.parameterVersion||'旧版'}\n\n## 结果与诊断\n\n${(r.calculation.notes||[]).join('\n\n')}\n\n${r.method.caution}\n\n\`\`\`json\n${JSON.stringify(r.calculation,null,2)}\n\`\`\`\n\n## 冻结输入、来源、配置与版本差异\n\n以下完整快照用于复现；来源核定属于研究人员声明。\n\n\`\`\`json\n${JSON.stringify(r,null,2)}\n\`\`\`\n`;}
const repos=new Map();
function repository(dir){if(!repos.has(dir))repos.set(dir,new StrategyRepository(dir));return repos.get(dir);}
export async function serveStrategy(req,res,url,{store,dir,serial,body,json,client=null,model=''}){
 if(!url.pathname.startsWith('/api/strategy/'))return false;
 const repo=repository(dir),route=url.pathname.slice('/api/strategy/'.length),start=Date.now();res.setHeader('Cache-Control','no-store');let requestId;
 const actor={id:'authenticated-researcher'};
 const catalogFor=(request,old)=>request.runMode==='frozen'&&old?{snapshotAt:old.snapshotAt,insightRevision:old.insightRevision}:getQuantCatalog(store.data,safeScope(request.scope));
 async function previous(id){if(!id)return null;const r=await repo.get(id),index=await repo.index();return {...r,studyId:r.studyId||index.items.find(x=>x.id===id)?.studyId||id};}
 try{
 if(route==='catalog'&&req.method==='GET'){
   const scope=safeScope(Object.fromEntries(url.searchParams)),catalog=getQuantCatalog(store.data,scope),page=await repo.page(),index=await repo.index(),series=(catalog.series||[]).filter(usableSeries).map(s=>({id:s.id,name:s.name,unit:s.unit,frequency:s.frequency,topic:s.topic,sourceId:s.sourceId,sourceName:catalog.sources.find(v=>v.id===s.sourceId)?.name||s.sourceId,sourceUrl:s.sourceUrl||'',note:s.note||'',country:s.country||'',nature:s.nature||'',count:s.rows.length,from:s.rows[0]?.period,to:s.rows.at(-1)?.period}));
   const suggested=recommendations(catalog),themes=templates.templates.map(t=>classifyTemplate(templateReadiness(t,catalog))),discovery=buildDiscovery(suggested,themes);
   json(res,200,{...methodCatalog,methods:methodCatalog.methods.map(m=>({...m,engineStatus:m.status==='ready'?'accepted':'planned',engineVersion:m.status==='ready'?ENGINE_VERSION:null,dataStatus:'needs-data',inputSchema:m.id,outputSchema:'strategy-calculation-v2',diagnostics:m.caution})),scope,filterOptions:{topics:standardTopics.map(({id,name})=>({id,name})),countries:[...countries.map(({code,name})=>({code,name})),{code:'GLOBAL',name:'跨国 / 全球口径'}],sources:catalog.sources.map(({id,name})=>({id,name}))},inputOptions:buildInputOptions(store.data,catalog,indicators,relationTypes),series,tasks:taskNames,parameterGovernance:governance,indicatorDictionary:indicators,methodAdvisor:{version:ADVISOR_VERSION,aiAvailable:!!client&&!!model},templates:themes,recommendations:suggested,discovery,assets:{snapshotAt:catalog.snapshotAt,insightRevision:catalog.insightRevision||null,articles:(catalog.documents||[]).filter(d=>d.classification?.status==='accepted').length,observations:(catalog.observations||[]).filter(o=>o.included).length,series:series.length,points:series.reduce((n,s)=>n+s.count,0),savedVersions:page.total,savedStudies:page.totalStudies,savedInputs:new Set(index.items.map(r=>r.numericInputHash||r.dataHash)).size,reusedTemplates:new Set(index.items.filter(r=>r.templateId).map(r=>r.templateId)).size,warning:'当前范围快照与真实保存记录；不代表全产业覆盖或业务审核完成'},studies:page.items,pagination:page,warnings:page.warnings});return true;
 }
 if(['advice','advice/confirm'].includes(route)&&req.method==='POST'){const request=await body(req,8000000);validateAdviceRequest(request);const catalog=getQuantCatalog(store.data,safeScope(request?.scope)),advisor=advisorFor(store,client,model);const result=route==='advice'?await advisor.analyze(request,catalog,{force:request.refreshAI===true}):advisor.confirm(request,catalog,request.confirmation);json(res,200,result);return true;}
 if(route==='studies'&&req.method==='GET'){json(res,200,await repo.page({page:Number(url.searchParams.get('page')||1),pageSize:Number(url.searchParams.get('pageSize')||20),studyId:url.searchParams.get('studyId')||undefined}));return true;}
 if(['studies','validate','match','parameter-changes'].includes(route)&&req.method==='POST'){
   const request=await body(req,8000000);requestId=request?.requestId;
   if(!isObject(request))invalid('研究请求须为对象');
   if(route==='match'){if(typeof request.taskType!=='string')invalid('请选择研究任务');json(res,200,{matches:matchMethods(request.taskType,{structure:request.dataset?'series':request.dataStructure||'matrix'},methodCatalog.methods),readiness:checkStudyReadiness(request,methodCatalog.methods)});return true;}
   const old=await previous(request.parentVersionId||request.parentId);
   if(route!=='parameter-changes')validateRequest(request);
   if(route==='parameter-changes'){if(!old)invalid('须引用父版本');json(res,200,validateParameterChanges(old,request.parameterChanges,actor));return true;}
   if(route==='match'){json(res,200,{matches:matchMethods(request.taskType,{structure:request.dataset?'series':request.dataStructure||'matrix'},methodCatalog.methods),readiness:checkStudyReadiness(request,methodCatalog.methods)});return true;}
   if(route==='validate'){
     const readiness=checkStudyReadiness(request,methodCatalog.methods);
     if(!readiness.canExecute){json(res,200,readiness);return true;}
     const record=buildStudy(catalogFor(request,old),request,old,actor);
     json(res,200,{...readiness,resolvedInputSummary:{objects:record.input.matrix?.length,indicators:record.input.indicators?.length,periods:record.input.rows?.length,source:record.provenance.kind},diagnostics:record.calculation.result.consistency||(['ahp'].includes(request.method)?record.calculation.result:null),saved:false});return true;
   }
   await repo.transact(()=>serial(async()=>{
     const requestHash=digest(request),existing=await repo.findRequest(request.requestId,requestHash);
     if(existing){json(res,200,{...existing,persistence:{saved:true,idempotentReplay:true}});return;}
     const record=buildStudy(catalogFor(request,old),request,old,actor);record.requestId=request.requestId||randomUUID();record.requestHash=requestHash;
     await repo.save(record);console.info(JSON.stringify({event:'strategy.saved',requestId:record.requestId,methodId:request.method,engineVersion:record.engineVersion,durationMs:Date.now()-start}));
     json(res,201,{...record,persistence:{saved:true,idempotentReplay:false}});
   }));return true;
 }
 const match=route.match(/^studies\/([a-f0-9-]{36})(?:\/(export|updates|reproduce|recalculate))?$/);
 if(match){const old=await previous(match[1]);
   if(req.method==='GET'&&!match[2]){json(res,200,old);return true;}
   if(req.method==='GET'&&match[2]==='export'){
     const markdown=url.searchParams.get('format')==='md';res.writeHead(200,{'Content-Type':markdown?'text/markdown; charset=utf-8':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="strategy-${old.id}.${markdown?'md':'json'}"`});res.end(markdown?exportMarkdown(old):JSON.stringify(old,null,2));return true;
   }
   if(req.method==='GET'&&match[2]==='updates'){
     if(!old.dataset){json(res,200,{status:'manual-review',message:'人工数据须核定新输入；旧快照保持不变'});return true;}
     try{const next=buildStudy(getQuantCatalog(store.data,old.scope),{title:old.title,method:old.method.id,input:old.input,dataset:old.dataset,scope:old.scope,confirmed:true,configuration:old.configuration,review:old.review,constraints:old.constraints},old,actor);json(res,200,{status:next.comparison.numericChanged||next.comparison.evidenceChanged?'review-update':'unchanged',comparison:next.comparison,policy:'核定后手动复算另存新版本'});}catch(e){json(res,200,{status:'needs-data',message:e instanceof StrategyError?e.message:'当前数据暂不可读取'});}return true;
   }
   if(req.method==='POST'&&['reproduce','recalculate'].includes(match[2])){
     const b=await body(req,8000000);requestId=b?.requestId;
     const frozen=match[2]==='reproduce',request={title:old.title,method:old.method.id,input:old.input,provenance:old.provenance,dataset:old.dataset,scope:old.scope,configuration:old.configuration,constraints:old.constraints,review:old.review,...(frozen?{}:b),confirmed:b.confirmed===true,parentId:old.id,studyId:old.studyId,runMode:frozen?'frozen':'current',requestId:b.requestId};
     validateRequest(request);await repo.transact(()=>serial(async()=>{const requestHash=digest(request),existing=await repo.findRequest(request.requestId,requestHash);if(existing){json(res,200,{...existing,persistence:{saved:true,idempotentReplay:true}});return;}const record=buildStudy(catalogFor(request,old),request,old,actor);record.requestId=request.requestId||randomUUID();record.requestHash=requestHash;await repo.save(record);json(res,201,{...record,persistence:{saved:true}});}));return true;
   }
 }
 json(res,405,{code:'METHOD_NOT_ALLOWED',error:'不支持的研究操作'});return true;
 }catch(e){const publicError=e instanceof StrategyError||e instanceof SyntaxError;console.error(JSON.stringify({event:'strategy.failed',requestId,code:e.code||e.name,durationMs:Date.now()-start}));json(res,e.status||(e instanceof SyntaxError?400:500),{code:e.code||'INVALID_INPUT',error:publicError?e.message:'量化研究暂不可用，请检查规则或保存目录后重试',message:publicError?e.message:'研究未保存，请保留草稿后重试',fieldErrors:e.fieldErrors||[],requestId,persistence:{saved:false}});return true;}
}
