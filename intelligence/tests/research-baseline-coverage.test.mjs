import test from 'node:test';import assert from 'node:assert/strict';import {articleIndex,mapCoverage} from '../research/baseline-coverage.mjs';
test('baseline preserves excluded and manual decisions and hashes exact original content',()=>{
 const original={id:7,title:'article',link:'https://example.org/7',content:'<p>'+ 'evidence '.repeat(80)+'</p>',filter_status:'rejected',manual_classify:true,published_at:'2026-10-14 23:30:00',reject_reason:'manual exclusion'};
 const a=articleIndex(original);assert.equal(a.nextAction,'preserve_exclusion');assert.equal(a.manualClassified,true);assert.equal(a.publishedAt,original.published_at);assert.equal(a.rejectReason,'manual exclusion');assert.equal(a.analysisStatus,'not_analyzed');assert.notEqual(articleIndex({...original,content:original.content+' '}).bodyHash,a.bodyHash);
});
test('missing/HTML-only bodies are not analysis ready; URL candidates never merge source records',()=>{
 const a=articleIndex({id:1,link:'same',content:'<script>some text</script><p>&nbsp;</p>',filter_status:'accepted'}),b=articleIndex({id:2,link:'same',content:'x'.repeat(250),filter_status:'accepted'});
 assert.equal(a.nextAction,'body_required');assert.equal(b.nextAction,'ready_for_isolated_analysis');const report=mapCoverage([a,b],[{id:'d1',url:'same'},{id:'d2',url:'same'}]);assert.equal(report.originalArticles,2);assert.equal(report.mappingStates.ambiguous_url,2);assert.equal(report.analysis.completed,0);assert.equal(a.structuredMatches.length,2);assert.equal(a.originalId,1);
 assert.equal(articleIndex({id:3,content:'x'.repeat(250),filter_status:'accepted',classify_method:'manual'}).nextAction,'preserve_manual_review');
});
