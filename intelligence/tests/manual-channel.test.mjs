import test from 'node:test';
import assert from 'node:assert/strict';
import {manualEvent} from '../manual.mjs';
import {Store} from '../store.mjs';
import {mergeAudit} from '../classification-audit.mjs';
test('manual intake shares its channel, preserves publisher, and classifies on ingestion',async()=>{
 const input={title:'海洋油气开发',summary:'海洋油气开发进展',quote:'海洋油气项目启动开发。',sourceName:'原始发布机构',url:'https://example.org/article',eventDate:'2026-10-16',publishedAt:'2026-10-16',topic:'海洋油气',type:'项目进展',country:'CN'};
 const entry=manualEvent(input),other=manualEvent({...input,sourceName:'另一媒体',url:'https://example.net/item'});
 assert.equal(entry.source.id,other.source.id);assert.equal(entry.source.name,'人工上传');assert.equal(entry.document.originalPublisher,'原始发布机构');
 const store=new Store('unused');store.data={sources:[],documents:[],events:[],evidence:[],entities:[],relations:[],observations:[],industryRuleConfig:{rules:[{id:1,type:'include',topic:'海洋油气',enabled:true,title_keywords:['海洋油气'],content_keywords:[]}]}};store.import=async value=>{store.data=value;};await store.addManual(entry);
 assert.equal(store.data.documents[0].industry.status,'accepted');
 const audit=mergeAudit({working:store.data.documents,sources:store.data.sources,articles:[],mp:[],evidence:[]});assert.equal(audit.documents[0].channelGroup,'manual');assert.equal(audit.documents[0].sourceName,'人工上传');
});
