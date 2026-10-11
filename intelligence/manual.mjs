import {randomUUID} from 'node:crypto';
import {countries,topics,id} from './core.mjs';
export function manualEvent(input){
 const get=(key,max,required=true)=>{const v=String(input[key]||'').trim();if((required&&!v)||v.length>max)throw new Error('请填写有效的'+key);return v;};
 const title=get('title',240),summary=get('summary',2000),quote=get('quote',5000),sourceName=get('sourceName',160),url=get('url',2000);
 const u=new URL(url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('原始链接必须为 HTTP 或 HTTPS 地址');
 const date=key=>{const v=get(key,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(v).toISOString().slice(0,10)!==v)throw new Error('日期格式不正确');return v;};
 const eventDate=date('eventDate'),publishedAt=date('publishedAt'),topic=get('topic',30),type=get('type',60);
 if(!topics.includes(topic))throw new Error('请选择领域');
 const codes=[...new Set([get('country',2),get('relatedCountry',2,false)].filter(Boolean))];if(codes.some(c=>!countries.some(x=>x.code===c)))throw new Error('请选择有效国家');
 const now=new Date().toISOString(),documentId='manual_'+randomUUID(),versionId=id('ver',documentId+quote),sourceId=id('manualsource',sourceName+u.origin),evidenceId=id('ev',versionId+quote);
 const document={id:documentId,versionId,sourceId,title,titleZh:title,summaryZh:summary,content:quote,url,publishedAt,collectedAt:now,topic,language:'und',originalPublisher:sourceName,translationType:'人工录入原文片段；非完整网页',extractionVersion:'manual-v1',manual:true};
 const event={id:'event_'+randomUUID(),documentId,title,summary,type,topic,countries:codes,eventDate,publishedAt,status:'candidate',method:'人工录入，来源与事实尚待核验',manual:true,evidenceIds:[evidenceId],entityIds:[],dateBasis:'人工分别录入事件日期与发布日期'};
 return {document,event,evidence:{id:evidenceId,documentId,versionId,quote,start:0},source:{id:sourceId,name:sourceName,url:u.origin,level:'人工来源',method:'manual',status:'ready',checkedAt:now,scope:'人工提交链接与原文片段，尚未自动核对网页'}};
}
