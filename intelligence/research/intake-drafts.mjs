import {randomUUID} from 'node:crypto';
import {digest,fail} from './ledger.mjs';
import {topics,countries} from '../core.mjs';
export class IntakeDrafts{
 constructor(state,store){this.state=state;this.store=store;}
 async create({requestKey,text='',upload=null,scope={}},actor){
  if(typeof requestKey!=='string'||requestKey.length<8||requestKey.length>120)fail('INVALID_REQUEST_KEY','缺少有效提交标识');
  const raw=upload?upload.text:text;if(typeof raw!=='string'||raw.trim().length<15||raw.length>60000)fail('INVALID_SOURCE','请提供15至60000字正文；附件须先取得可读正文');
  const source={text:raw,attachment:upload?{id:upload.id,name:upload.name,mime:upload.mime,method:upload.method,status:upload.status}:null},fingerprint=digest({source,scope});
  return this.state.transact(s=>{s.intakeDrafts??={};s.intakeKeys??={};const previous=s.intakeKeys[requestKey];if(previous){if(previous.fingerprint!==fingerprint)fail('IDEMPOTENCY_CONFLICT','相同提交标识不能对应不同资料',409);return s.intakeDrafts[previous.id];}
   const id='draft_'+randomUUID(),now=new Date().toISOString(),draft={id,revision:1,status:'draft',source,sourceDigest:digest(source),scope,fields:{title:'',summary:'',quote:'',sourceName:upload?.name||'',url:'',eventDate:'',publishedAt:'',topic:topics.includes(scope.topic)?scope.topic:'',type:'其他',country:''},createdAt:now,history:[{action:'source_saved',actor,at:now}]};s.intakeDrafts[id]=draft;s.intakeKeys[requestKey]={id,fingerprint};return draft;});
 }
 async get(id){return this.state.transact(s=>{const d=s.intakeDrafts?.[id];if(!d)fail('DRAFT_NOT_FOUND','草稿不存在',404);return d;});}
 async edit(id,{revision,fields},actor){return this.state.transact(s=>{const d=s.intakeDrafts?.[id];if(!d)fail('DRAFT_NOT_FOUND','草稿不存在',404);if(d.status!=='draft'||d.revision!==revision)fail('DRAFT_CONFLICT','草稿已更新或确认，请重新读取',409);
  const next={};for(const [key,max] of Object.entries({title:240,summary:2000,quote:5000,sourceName:160,url:2000,eventDate:10,publishedAt:10,topic:30,type:60,country:2})){const v=fields?.[key]??d.fields[key];if(typeof v!=='string'||v.length>max)fail('INVALID_DRAFT','草稿字段无效：'+key);next[key]=v.trim();}
  d.history.push({action:'edited',actor,at:new Date().toISOString(),revision:d.revision,fields:d.fields});d.fields=next;d.revision++;return d;});}
 async confirm(id,{revision},actor){return this.state.transact(async s=>{
  const d=s.intakeDrafts?.[id];if(!d)fail('DRAFT_NOT_FOUND','草稿不存在',404);if(d.status==='confirmed')return d;if(d.revision!==revision)fail('DRAFT_CONFLICT','草稿版本已变更，请核对后确认',409);
  const f=d.fields;if(!f.title||!f.summary||!f.quote||!d.source.text.includes(f.quote))fail('INVALID_EVIDENCE','标题、摘要和来自原文的连续证据片段必填');if(!topics.includes(f.topic))fail('INVALID_TOPIC','请确认研究领域');if(f.country&&!countries.some(c=>c.code===f.country))fail('INVALID_COUNTRY','国家无效；未知可留空');
  for(const k of ['eventDate','publishedAt'])if(f[k]&&(!/^\d{4}-\d{2}-\d{2}$/.test(f[k])||!Number.isFinite(Date.parse(f[k]))||new Date(f[k]).toISOString().slice(0,10)!==f[k]))fail('INVALID_DATE','日期无效；未知请留空');
  if(f.url){let u;try{u=new URL(f.url);}catch{fail('INVALID_URL','原始链接格式无效');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)fail('INVALID_URL','原始链接须为 HTTP 或 HTTPS');}
  const documentId='manual_'+digest(id),eventId='event_'+digest(id),versionId='ver_'+digest(d.source.text),evidenceId='ev_'+digest({id,quote:f.quote}),sourceId='manualsource_'+digest({id,source:d.sourceDigest}),now=new Date().toISOString();
  const document={id:documentId,versionId,sourceId,title:f.title,titleZh:f.title,summaryZh:f.summary,content:d.source.text,url:f.url||null,publishedAt:f.publishedAt||null,collectedAt:now,topic:f.topic,language:'und',manual:true,intakeDraftId:id,attachment:d.source.attachment,translationType:'人工补充；原文保留',extractionVersion:'intake-draft-v1'};
  const event={id:eventId,documentId,title:f.title,summary:f.summary,type:f.type||'其他',topic:f.topic,countries:f.country?[f.country]:[],eventDate:f.eventDate||null,publishedAt:f.publishedAt||null,status:'candidate',manual:true,method:'人工确认草稿；事件事实未经独立核验',evidenceIds:[evidenceId],entityIds:[],dateBasis:'未知日期保留为空'};
  // Stable IDs reconcile a successful source commit followed by an interrupted draft-state write.
  const existing=this.store.data.documents.find(x=>x.id===documentId);if(existing){if(existing.intakeDraftId!==id||existing.content!==document.content)fail('SOURCE_CONFLICT','已存在资料与草稿不一致',409);}else await this.store.addManual({document,event,evidence:{id:evidenceId,documentId,versionId,quote:f.quote,start:d.source.text.indexOf(f.quote)},source:{id:sourceId,name:f.sourceName||'人工补充资料',url:f.url||null,level:'人工来源',method:'manual',status:'ready',checkedAt:now}});
  d.status='confirmed';d.result={documentId,eventId};d.revision++;d.history.push({action:'confirmed',actor,at:now});return d;
 });}
}
