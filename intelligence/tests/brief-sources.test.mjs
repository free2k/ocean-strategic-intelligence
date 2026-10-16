import test from 'node:test';import assert from 'node:assert/strict';
import {briefSources} from '../public/period-reports.js';
test('brief sources deduplicate labels while retaining all original references',()=>{
 const sources=['Offshore Engineer','www.oedigital.com','Offshore Engineer','风能专委会CWEA'].map((sourceName,i)=>({sourceName,body:{title:'文章'+i,url:'https://example.org/'+i,publishedAt:'2026-10-16'}}));
 const html=briefSources(sources);assert(html.startsWith('<p>来源：Offshore Engineer、风能专委会CWEA</p>'));assert(html.includes('（4 篇）'));assert.equal((html.match(/<a /g)||[]).length,4);assert(!html.includes('<details open'));assert(html.includes('文章3'));assert(briefSources([{sourceName:'<script>',body:{url:'javascript:alert(1)'}}]).includes('&lt;script&gt;'));
});
