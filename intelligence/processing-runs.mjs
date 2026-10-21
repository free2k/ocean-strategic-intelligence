import {textSlice} from './unicode-text.mjs';
import fs from 'node:fs/promises';
import {mkdirSync,appendFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {FileRuntimeState} from './research/runtime-state.mjs';
import {compileRules,classifyRecord} from './industry-classification.mjs';
import {semanticDecision} from './semantic-classification.mjs';
import {extractArticle,extractionError,applyExtraction} from './auto-extract.mjs';

const active=new Set(['queued','running','stopping']);
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const clone=x=>structuredClone(x);
export function reviewCutoff(now=new Date()){
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const [year,month,date]=day.split('-').map(Number),target=new Date(Date.UTC(year,month-4,1));
 const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
 return `${target.getUTCFullYear()}-${String(target.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(date,last)).padStart(2,'0')}`;
}
export const tooOld=(value,cutoff)=>value&&Number.isFinite(Date.parse(value))&&new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))<cutoff;

export const processingScopes={pending:'待筛选',accepted:'已纳入',excluded:'已排除',all:'全部文章'};
export function selectProcessingDocuments(documents,scope='pending'){
 if(!Object.hasOwn(processingScopes,scope))fail('无效处理范围',400);
 return documents.filter(d=>!d.manual&&!d.classification?.manual&&(scope==='all'||(d.classification?.status||'unmatched')===({pending:'unmatched',accepted:'accepted',excluded:'excluded'}[scope])));
}
// This controller deliberately owns an isolated file workspace. No production database,
// scheduler or systemd mutations occur here. A live adapter requires separate approval.
export class ProcessingRuns{
 constructor({dir,readInput,client,model='qwen-plus',clock=()=>new Date().toISOString(),extract=extractArticle,review=semanticDecision,mode='local',acquire=null,loadDocument=null,publish=null}){
  Object.assign(this,{dir,readInput,client,model,clock,extract,review,mode,acquire,loadDocument,publish});this.state=new FileRuntimeState(path.join(dir,'tasks'));this.serial=Promise.resolve();this.controllers=new Map();this.workers=new Map();
 }
 tx(fn){const next=this.serial.catch(()=>{}).then(()=>this.state.transact(fn));this.serial=next;return next;}
 async *iterateResults(task){for(const r of task.results)yield JSON.parse(await fs.readFile(path.join(this.dir,r.file),'utf8'));}
 async recover(){await this.tx(s=>{for(const task of Object.values(s.processingRuns||{}))if(active.has(task.status)){task.status='interrupted';task.stage='interrupted';task.finishedAt=this.clock();this.log(task,'interrupted','服务重启，本轮已中断；已保存检查点，未自动发布。');}});}
 log(t,type,message,details={}){const row={seq:(t.logSeq||t.logs.at(-1)?.seq||0)+1,at:this.clock(),type,message,...details};t.logSeq=row.seq;mkdirSync(path.join(this.dir,t.id),{recursive:true});appendFileSync(path.join(this.dir,t.id,'logs.jsonl'),JSON.stringify(row)+'\n');t.logs.push(row);if(t.logs.length>400)t.logs.splice(0,t.logs.length-400);}
 async preview(scope='pending'){const input=await this.readInput(),config=compileRules(input.config),documents=selectProcessingDocuments(input.documents,scope);
  const cutoff=reviewCutoff(new Date(this.clock())),previewToken=digest(randomUUID());
  await fs.mkdir(path.join(this.dir,'previews'),{recursive:true});await fs.writeFile(path.join(this.dir,'previews',previewToken+'.json'),JSON.stringify({input:{...input,documents},cutoff,scope,createdAt:this.clock()}),{flag:'wx'});
  return {enabled:true,mode:this.mode,model:this.model,modelAvailable:!!this.client,ruleVersion:config.version,capturedAt:input.capturedAt,count:documents.length,cutoff,oldCount:documents.filter(d=>tooOld(d.publishedAt,cutoff)).length,processingScope:scope,scopeLabel:processingScopes[scope],previewToken,scope:this.mode==='live'?processingScopes[scope]+'；完成后合并工作库并发布网站成果':'本地样本 · '+processingScopes[scope]+'；只写本地工作库和发布快照',documents:this.mode==='live'?[]:documents.map(({content,...d})=>d)};
 }
 async start({confirmed,requestId,previewToken,processingScope='pending'}){
  if(confirmed!==true)fail('请先确认启动',400);
  if(!/^[\w-]{8,100}$/.test(requestId||''))fail('缺少有效幂等请求编号',400);
  // Recognize a retried HTTP request even if rules changed after its first submission.
  const existing=await this.tx(s=>Object.values(s.processingRuns||{}).find(t=>t.requestId===requestId));if(existing){if(existing.previewToken!==previewToken||(existing.processingScope||'pending')!==processingScope)fail('同一请求编号不能用于不同范围');return this.public(existing);}
  if(!/^[a-f0-9]{64}$/.test(previewToken||''))fail('预览已过期，请重新确认');
  const saved=await fs.readFile(path.join(this.dir,'previews',previewToken+'.json'),'utf8').then(JSON.parse).catch(()=>null);
  if(!saved||saved.scope!==processingScope||Date.parse(this.clock())-Date.parse(saved.createdAt)>3600000)fail('预览范围已变化或过期，请重新确认');
  const latest=await this.readInput();if(digest(latest.config)!==digest(saved.input.config))fail('行业规则已变化，请重新确认');
  const input=saved.input,preview={count:input.documents.length,ruleVersion:compileRules(input.config).version,cutoff:saved.cutoff};
  if(!preview.count)fail('所选范围没有可处理文章',400);
  if(!this.client)fail('本地尚未配置模型，不能启动真实处理',503);
  const task=await this.tx(async s=>{
   s.processingRuns||={};const same=Object.values(s.processingRuns).find(t=>t.requestId===requestId);if(same)return clone(same);
   if(Object.values(s.processingRuns).some(t=>active.has(t.status)))fail('已有任务执行中；请先中断并等待其退出，再开始新一轮');
   const t={id:randomUUID(),requestId,previewToken,processingScope,scopeLabel:processingScopes[processingScope],mode:this.mode,ruleVersion:preview.ruleVersion,cutoff:preview.cutoff,startedAt:this.clock(),status:'queued',stage:'queued',total:preview.count,processed:0,accepted:0,excluded:0,unmatched:0,results:[],retries:[],logs:[]};
   this.log(t,'queued','本轮已创建：锁定最新规则与样本范围。',{ruleVersion:t.ruleVersion,count:t.total});s.processingRuns[t.id]=t;return clone(t);
  });
  if(!this.workers.has(task.id)&&task.status==='queued'){
   const abort=new AbortController();this.controllers.set(task.id,abort);
   const work=this.run(task.id,input,abort.signal).finally(async()=>{this.controllers.delete(task.id);this.workers.delete(task.id);});this.workers.set(task.id,work);
  }return this.public(task);
 }
 public(t,after=0){if(!t)return null;const {results,...rest}=clone(t);rest.logs=rest.logs.filter(l=>l.seq>after).slice(0,200);rest.lastSeq=t.logSeq||t.logs.length;rest.facts={events:results.reduce((n,r)=>n+(r.extraction?.events.length||0),0),entities:results.reduce((n,r)=>n+(r.extraction?.entities.length||0),0),observations:results.reduce((n,r)=>n+(r.extraction?.observations.length||0),0)};return rest;}
 async current(after=0,id){await this.serial.catch(()=>{});const state=await this.state.read();const task=(()=>{const s=state;const tasks=Object.values(s.processingRuns||{}).sort((a,b)=>b.startedAt.localeCompare(a.startedAt));return this.public(id?tasks.find(t=>t.id===id):tasks[0],after);})();if(task&&task.logs[0]?.seq>after+1){const raw=await fs.readFile(path.join(this.dir,task.id,'logs.jsonl'),'utf8');task.logs=raw.trim().split('\n').map(JSON.parse).filter(l=>l.seq>after).slice(0,200);}return task;}
 async stop(id,{confirmed}){
  if(confirmed!==true)fail('请先确认中断',400);
  const task=await this.tx(s=>{const t=s.processingRuns?.[id];if(!t)fail('任务不存在',404);if(!active.has(t.status))return this.public(t);
   if(t.status!=='stopping'){t.status='stopping';this.log(t,'stopping','已请求中断：取消当前模型请求，等待安全退出。');}return this.public(t);});
  this.controllers.get(id)?.abort();return task;
 }
 async update(id,change){return this.tx(s=>change(s.processingRuns[id]));}
 async resumePublication(id){
  if(!this.publish)fail('当前环境不支持恢复发布',400);
  const task=await this.tx(s=>{
   const t=s.processingRuns?.[id];if(!t)fail('任务不存在',404);
   if(t.publication)return clone(t);
   if(Object.values(s.processingRuns).some(x=>active.has(x.status)))fail('已有任务执行中');
   if(t.status!=='failed'||t.processed!==t.total||t.results.length!==t.total||!(t.failedStage==='merging'||t.failedStage==='publishing'||t.logs.some(l=>l.type==='merging')))fail('只能恢复已完成逐篇处理的合并失败任务');
   return clone(t);
  });
  if(task.publication)return task.publication;
  // Check all checkpoints before changing the task state. No model client is used.
  const saved=JSON.parse(await fs.readFile(path.join(this.dir,'previews',task.previewToken+'.json'),'utf8'));
  const results=[];if(!this.publish)for await(const result of this.iterateResults(task))results.push(result);
  await this.update(id,t=>{t.status='running';t.stage='merging';delete t.finishedAt;this.log(t,'merging','从已保存检查点恢复合并；不重复调用模型',{checkpointCount:task.results.length});});
  try{
   const publication=await this.publish({task,input:saved.input,iterateResults:()=>this.iterateResults(task),readResults:async()=>{const rows=[];for await(const row of this.iterateResults(task))rows.push(row);return rows;}});
   await this.update(id,t=>{t.status=t.retries.length?'partial':'completed';t.stage='published';t.finishedAt=this.clock();t.publication=publication;delete t.failedStage;this.log(t,'published','已恢复合并并发布网站成果',publication);});return publication;
  }catch(error){await this.update(id,t=>{t.status='failed';t.failedStage='merging';t.stage='failed';t.finishedAt=this.clock();this.log(t,'failed','恢复合并失败，检查点保留',{...extractionError(error),errorCode:/^[A-Z0-9_]{3,50}$/.test(error.code||'')?error.code:null,failedStage:'merging'});});throw error;}
 }
 async run(id,input,signal){
  const check=()=>{if(signal.aborted)throw Object.assign(Error('stopped'),{name:'AbortError'});};
  const emit=(type,message,details)=>this.update(id,t=>this.log(t,type,message,details));
  const stage=async value=>{check();await this.update(id,t=>{if(t.status==='stopping')throw Object.assign(Error('stopped'),{name:'AbortError'});t.status='running';t.stage=value;});};
  const task=await this.tx(s=>clone(s.processingRuns[id]));const rules=compileRules(input.config);
  let release;
  try{
   if(this.acquire){let waiting=false;while(!release){check();try{release=await this.acquire();}catch(error){if(error.status!==409)throw error;if(!waiting){await this.update(id,t=>{t.stage='waiting';this.log(t,'waiting','任务已排队，等待其他批次安全退出',{reason:error.message});});waiting=true;}await new Promise(resolve=>{const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,3000);signal.addEventListener('abort',done,{once:true});if(signal.aborted)done();});}}check();}
   const documents=selectProcessingDocuments(input.documents,task.processingScope||'pending');let nextIndex=0;
   const worker=async()=>{while(nextIndex<documents.length){const original=documents[nextIndex++];
    check();const articleStarted=Date.now();const loaded=this.loadDocument?await this.loadDocument(original):original;check();const d={...loaded,versionId:'ver_'+digest(loaded),language:/[\u4e00-\u9fff]/.test(loaded.content)?'zh':'en'};
    const meta={documentId:d.id,title:d.title,source:d.sourceName,publishedAt:d.publishedAt};
    await stage('classifying');const ruleStarted=Date.now();let decision=classifyRecord(d,rules);
    const terms=[...new Set([...(decision.positive||[]).flatMap(p=>(p.keywords||[]).map(k=>k.keyword)),...(decision.negative||[]).map(k=>k.keyword)])].filter(Boolean);
    const body=String(d.content||''),lower=body.toLowerCase();const hitExcerpts=terms.slice(0,20).map(term=>{const at=lower.indexOf(term.toLowerCase());return at<0?null:textSlice(body,Math.max(0,at-70),at+term.length+100);}).filter(Boolean);
    await emit('classification','关键词规则匹配完成',{...meta,ruleVersion:rules.version,status:decision.status,industry:decision.primary,topics:decision.topics,reason:decision.reason,positive:decision.positive,negative:decision.negative,context:decision.context,hitExcerpts:[...new Set(hitExcerpts)],durationMs:Date.now()-ruleStarted});
    let extraction=null,retry=null;
    const client={chat:{completions:{create:async request=>{
     check();const began=Date.now(),timeout=180000;
     await emit('model_request','正在请求模型',{...meta,model:this.model});
     try{const response=await this.client.chat.completions.create({...request,model:this.model},{signal:AbortSignal.any([signal,AbortSignal.timeout(timeout)]),timeout});check();
      await emit('model_response','模型已响应',{...meta,model:response.model||this.model,durationMs:Date.now()-began,finishReason:response.choices?.[0]?.finish_reason,usage:response.usage});return response;
     }catch(error){if(signal.aborted)throw error;await emit('model_error','模型请求未完成',{...meta,...extractionError(error),durationMs:Date.now()-began});throw error;}
    }}}};
    try{
     if(decision.status==='unmatched'&&tooOld(d.publishedAt,task.cutoff))await emit('skipped','超过三个月：保留关键词结果，不进行 AI 复核',meta);
     else if(decision.status==='unmatched'&&!d.content?.trim())await emit('skipped','正文缺失，等待补充原文',meta);
     else if(decision.status==='unmatched'){
      await stage('reviewing');const reviewStarted=Date.now();decision=await this.review(d,decision,rules,{client,model:this.model});check();
      await emit('review','AI 行业复核完成',{...meta,status:decision.status,industry:decision.primary,topics:decision.topics,reason:decision.reason,quote:decision.semantic?.quote,durationMs:Date.now()-reviewStarted});
     }
     if(decision.status==='accepted'){
      if(!d.content?.trim())throw Error('empty_content');
      await stage('extracting');const extractStarted=Date.now();extraction=await this.extract(client,{...d,industry:decision});check();
      await emit('extraction','结构化事实提取完成',{...meta,industry:decision.primary,events:extraction.events,entities:extraction.entities,observations:extraction.observations,evidence:extraction.evidence,rejected:extraction.rejected,durationMs:Date.now()-extractStarted});
     }
    }catch(error){if(signal.aborted)throw error;retry={...meta,...extractionError(error),nextRetryAt:new Date(Date.parse(this.clock())+10*60000).toISOString()};await emit('retry',this.mode==='live'?'已保存待重试记录；成功结果将在本轮结束后合并发布':'已保存待重试记录；本地预览不会自动重复调用模型',retry);}
    check();await fs.mkdir(path.join(this.dir,id),{recursive:true});const resultFile=path.join(id,digest(d.id)+'.json');await fs.writeFile(path.join(this.dir,resultFile),JSON.stringify({document:d,decision,extraction,retry}));
    check();await this.update(id,t=>{t.results.push({file:resultFile,extraction:extraction?{events:{length:extraction.events.length},entities:{length:extraction.entities.length},observations:{length:extraction.observations.length}}:null});if(retry)t.retries.push(retry);t.processed++;t[decision.status==='accepted'?'accepted':decision.status==='excluded'?'excluded':'unmatched']++;this.log(t,'checkpoint','本篇结果已保存',{...meta,processed:t.processed,total:t.total,status:decision.status,industry:decision.primary,durationMs:Date.now()-articleStarted});});
   }};
   const outcomes=await Promise.allSettled(Array.from({length:this.mode==='live'?4:1},worker));const failed=outcomes.find(x=>x.status==='rejected');if(failed)throw failed.reason;
   await stage('merging');await emit('merging',this.mode==='live'?'开始合并本轮结果到工作库':'开始合并本轮结果到隔离工作库');
   check();await stage('publishing');
   // Keep the cancellation decision and the local publication pointer under one lock.
   await this.tx(async s=>{
    const t=s.processingRuns[id];check();if(t.status==='stopping')throw Object.assign(Error('stopped'),{name:'AbortError'});
    if(this.publish){const publication=await this.publish({task:t,input,iterateResults:()=>this.iterateResults(t),readResults:async()=>Promise.all(t.results.map(r=>fs.readFile(path.join(this.dir,r.file),'utf8').then(JSON.parse)))});t.status=t.retries.length?'partial':'completed';t.stage='published';t.finishedAt=this.clock();t.publication=publication;this.log(t,'published','网站成果已发布',{releaseId:publication.releaseId});return;}
    const previous=await fs.readFile(path.join(this.dir,'published.json'),'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    const snapshot=previous?JSON.parse(await fs.readFile(path.join(this.dir,previous.file),'utf8')):{documents:[],entities:[],events:[],relations:[],observations:[],evidence:[]};
    for(const saved of t.results){const result=saved.file?JSON.parse(await fs.readFile(path.join(this.dir,saved.file),'utf8')):saved;const d=result.document,old=snapshot.documents.find(x=>x.id===d.id);if(old?.manual)continue;
     const mergedDoc={...d,industry:result.decision};snapshot.documents=snapshot.documents.filter(x=>x.id!==d.id);snapshot.documents.push(mergedDoc);
     if(result.extraction)applyExtraction(snapshot,mergedDoc,result.extraction,this.clock());
     else if(result.decision.status!=='accepted')for(const key of ['events','relations','observations'])snapshot[key]=(snapshot[key]||[]).filter(r=>r.documentId!==d.id||r.manual||r.reviewedAt||r.method==='官方原文规则校验');
    }
    const file=`release-${id}.json`;snapshot.publishedAt=this.clock();snapshot.ruleVersion=t.ruleVersion;
    await fs.writeFile(path.join(this.dir,file),JSON.stringify(snapshot),{flag:'wx'});
    const pointer=path.join(this.dir,'published.json'),temp=pointer+'.tmp';await fs.writeFile(temp,JSON.stringify({taskId:id,file,publishedAt:snapshot.publishedAt}));await fs.rename(temp,pointer);
    t.status=t.retries.length?'partial':'completed';t.stage='published';t.finishedAt=this.clock();t.publication={mode:'local',file,publishedAt:snapshot.publishedAt};this.log(t,'published',`本地发布完成；${t.retries.length} 篇待重试。线上数据未修改。`,{file});
   });
  }catch(error){await this.update(id,t=>{t.failedStage=t.stage;t.status=signal.aborted||error.name==='AbortError'?'interrupted':'failed';t.stage=t.status;t.finishedAt=this.clock();this.log(t,t.status,t.status==='interrupted'?'本轮已安全中断；已处理检查点保留，未发布未完成结果。':'任务异常结束，已保留检查点。',{...extractionError(error),errorCode:/^[A-Z0-9_]{3,50}$/.test(error.code||'')?error.code:null,failedStage:t.failedStage||null});});}finally{await release?.();}
 }
}

export async function serveProcessingRuns(req,res,url,manager){
 const route=url.pathname.replace(/\/$/,'');if(!route.startsWith('/api/processing-runs'))return false;
 const send=(code,payload)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(payload));};
 try{
  if(!manager){send(200,{enabled:false,reason:'任务控制面板正在本地验收，尚未启用线上任务控制'});return true;}
  if(req.method==='GET'){
   if(route.endsWith('/preview'))send(200,await manager.preview(url.searchParams.get('scope')||'pending'));
   else if(route.endsWith('/current'))send(200,{task:await manager.current(Math.max(0,Number(url.searchParams.get('after'))||0),url.searchParams.get('id'))});
   else send(404,{error:'未找到接口'});return true;
  }
  const origin=req.headers.origin;if(origin&&new URL(origin).host!==req.headers.host)fail('请求来源不匹配',403);
  if(req.method!=='POST'||!String(req.headers['content-type']).startsWith('application/json'))fail('请求格式不支持',415);
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16000)fail('请求过大',413);}let body;try{body=JSON.parse(raw);}catch{fail('JSON 格式无效',400);}
  if(route.endsWith('/start'))send(202,{task:await manager.start(body)});
  else {const match=route.match(/\/([a-f0-9-]{36})\/stop$/);if(!match)fail('未找到接口',404);send(200,{task:await manager.stop(match[1],body)});}
 }catch(error){send(error.status||500,{error:error.status?error.message:'任务接口异常，请重试'});}return true;
}
