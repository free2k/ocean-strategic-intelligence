import {canonicalTopic} from '../industry-topics.mjs';
import {fail} from './ledger.mjs';
import {reportRange} from './period-reports.mjs';
export const articleKey=url=>{try{const u=new URL(url);u.hash='';return u.href;}catch{return String(url||'');}};
async function readSaved(read){for(let n=0;;n++){try{return await read();}catch(e){if(e.code!=='SHARED_STATE_BUSY'||n>=9)throw e;await new Promise(resolve=>setTimeout(resolve,25*(n+1)));}}}
export async function monitorPeriod(reports,ledger,query={}){
 const items=await readSaved(()=>reports.list()),range=reportRange({preset:'7'});
 const report=query.periodReportId?items.find(j=>j.id===query.periodReportId&&j.status==='published'):items.find(j=>j.status==='published'&&j.range.from===(query.from||range.from)&&j.range.to===(query.to||range.to));
 if(!report)fail('PERIOD_NOT_PUBLISHED','所选时段尚无已发布简报，请先在情报证据中心生成发布。',404);
 const job=await readSaved(()=>reports.get(report.id));
 if(query.country)fail('PERIOD_COUNTRY_UNAVAILABLE','本期简报未保存完整国家信息，请清除地域筛选。',400);
 const documents=job.documents.filter(e=>(!query.topic||canonicalTopic(e.classification?.primary)===canonicalTopic(query.topic))&&(!query.sourceId||e.sourceId===query.sourceId)&&(!query.from||Date.parse(e.body.publishedAt)>=Date.parse(query.from+'T00:00:00+08:00'))&&(!query.to||Date.parse(e.body.publishedAt)<Date.parse(query.to+'T00:00:00+08:00')+86400000));
 const keys=new Set(documents.map(e=>articleKey(e.body.url))),release=await ledger.resolveRelease(query.releaseId?{releaseId:query.releaseId}:{}),snapshot=await ledger.snapshot(release.snapshotId);
 const linked=snapshot.entries.filter(e=>keys.has(articleKey(e.body.url))),documentIds=new Set(linked.map(e=>e.documentId));
 return {documentIds,releaseId:release.releaseId,reportId:job.id,range:job.range,publishedAt:job.publishedAt,documents,linkedDocuments:new Set(linked.map(e=>articleKey(e.body.url))).size,total:documents.length};
}
