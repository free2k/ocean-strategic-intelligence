import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseHTML} from 'linkedom';
import XLSX from 'xlsx';
import {referenceText,hydrogenRows,carbonLicences,collectPublicReplacements} from '../public-source-replacements.mjs';
import {syncSince} from '../../server/integrations/mp2rss-client.mjs';

test('initial and weekly syncs include available provider history, incremental syncs overlap seven days',()=>{
 assert.equal(syncSince(null),null);
 assert.equal(syncSince('2026-10-25T00:00:00Z',{deep:true}),null);
 assert.equal(syncSince('2026-10-25T00:00:00Z'),Date.parse('2026-10-18T00:00:00Z'));
 assert.throws(()=>syncSince('invalid'));
});
test('HTTP success with a challenge or an empty body cannot pass source validation',()=>{
 assert.throws(()=>referenceText('<title>Just a moment...</title><main>'+('fake content '.repeat(100))+'</main>'));
 assert.throws(()=>referenceText('<title>Report</title><p>Preview only</p>'));
});
test('hydrogen records preserve original geography, years and units, excluding blank formatting rows',()=>{
 const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([[],['Country','Project name','Year','Production capacity T/year'],['Austria','H2FUTURE',2024,992],[],['France','Another plant',2024,800],['Notes',null,null,null]]),'Plant by plant data');
 const rows=hydrogenRows(XLSX.write(w,{type:'buffer',bookType:'xlsx'}),'https://example.com/data.xlsx');
 assert.equal(rows.length,2);assert.equal(rows[0].year,2024);assert.equal(rows[0].raw['Production capacity T/year'],992);assert.equal(rows[0].classification.status,'unmatched');
 assert.throws(()=>hydrogenRows(Buffer.from('login page'),'https://example.com'));
});
test('carbon register counts licences once while retaining each original and variation',()=>{
 const d=parseHTML('<a href="/cs001.pdf">CS001 licence</a><a href="/cs001-variation.pdf">CS001 variation</a><a href="/cs002.pdf">CS002 licence</a><a href="https://other.example/cs003.pdf">CS003</a>').document;
 const rows=carbonLicences(d,'https://www.nstauthority.co.uk/');assert.equal(rows.length,2);assert.equal(rows[0].documents.length,2);
});
test('a failed replacement leaves the original source and historical documents intact',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'source-replacement-'));
 try{const initial={sources:[{id:'iaea-publications',status:'partial',checkedAt:'2026-10-24'}],documents:[{id:'old',sourceId:'iaea-publications',content:'Historical body'}]};await fs.writeFile(path.join(dir,'snapshot.json'),JSON.stringify(initial));
 const result=await collectPublicReplacements(dir,{sourceIds:['wna-marine-reference'],fetchResource:async()=>'<title>Human Verification</title>'});
 assert.equal(result.sources.find(s=>s.id==='iaea-publications').status,'partial');assert.equal(result.sources.find(s=>s.id==='wna-marine-reference').status,'failed');assert.equal(result.documents.length,1);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('only validated replacements retire old endpoints, without deleting historical evidence or inventing dates',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'source-replacement-'));
 try{await fs.writeFile(path.join(dir,'snapshot.json'),JSON.stringify({sources:[{id:'iaea-publications',status:'partial',checkedAt:'2026-10-24'}],documents:[{id:'old',sourceId:'iaea-publications',content:'Historical body'}]}));
 const result=await collectPublicReplacements(dir,{sourceIds:['wna-marine-reference'],fetchResource:async url=>'<html><head><title>Technical reference</title></head><body><article><h1>Nuclear marine reference</h1><p>'+('Substantive technical reference with original sources. '.repeat(30))+'</p></article></body></html>'});
 assert.equal(result.sources.find(s=>s.id==='iaea-publications').checkedAt,null);assert.equal(result.sources.find(s=>s.id==='iaea-publications').status,'retired');
 assert.equal(result.sources.find(s=>s.id==='wna-marine-reference').bodyDocuments,2);assert.equal(result.documents.find(d=>d.id==='old').content,'Historical body');assert.equal(result.documents.filter(d=>d.sourceId==='wna-marine-reference').every(d=>d.publishedAt===null),true);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('source metrics distinguish genuine data records and evidence-library bodies from empty article tables',async()=>{
 const text=await fs.readFile(new URL('../public/sensing.js',import.meta.url),'utf8');
 const line=text.split('\n').find(s=>s.startsWith('export function channelSourceMetrics('));
 const metrics=Function(line.replace(/^export /,'')+';return channelSourceMetrics')();
 const uk=metrics({id:'intel:uk-repd',count:0},[{id:'uk-repd',records:150}]);assert.equal(uk.count,0);assert.equal(uk.records,150);
 const oil=metrics({id:84,alias:'https://oilprice.com/rss/energy',count:0},[{id:'oilprice-news',url:'https://oilprice.com/rss/energy',articleCount:157,bodyDocuments:156}]);assert.equal(oil.count,157);assert.equal(oil.ready,156);
});
test('an external source check time never becomes an article publication date when body counts are present',async()=>{
 const text=await fs.readFile(new URL('../public/sensing.js',import.meta.url),'utf8');
 const line=text.split('\n').find(s=>s.startsWith('export function channelTimeLabel('));
 const label=Function(line.replace(/^export /,'')+';return channelTimeLabel')();
 assert.equal(label({type:'rss',ready:155}),'最近渠道检查');assert.equal(label({type:'official',ready:1}),'最近渠道检查');assert.equal(label({type:'mp',ready:10}),'最新文章发布日期');
});
