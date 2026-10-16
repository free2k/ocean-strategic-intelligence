import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeExtraction} from '../core.mjs';
function run(text,eventDate,dateQuote=text){const doc={id:'d',versionId:'v',topic:'海上风电',publishedAt:'2026-10-17',content:text};return normalizeExtraction(doc,{events:[{titleZh:'项目投运',quote:text,eventDate,dateQuote}]});}
test('explicit Chinese and English dates retain independent source evidence',()=>{
 for(const text of ['项目已于2026年10月16日正式投运。','The project began operation on October 16, 2026.','The project began operation on 16 October 2026.','The project began operation on 2026-10-16.']){
 const r=run(text,'2026-10-16'),e=r.events[0];assert.equal(e.eventDate,'2026-10-16');assert.equal(e.publishedAt,'2026-10-17');assert.equal(e.dateQuote,text);assert.equal(e.dateEvidenceIds.length,1);assert(r.evidence.some(p=>p.id===e.dateEvidenceIds[0]&&p.quote===text));assert.equal(e.status,'extracted');}
});
test('missing, relative, invalid or unsupported dates remain unknown',()=>{
 for(const [text,date] of [['2026年以来，海上风电项目成功投运。','2026-01-01'],['项目于10月16日正式投运，进展顺利。','2026-10-16'],['项目于2026年2月30日正式投运。','2026-02-30'],['项目于2026年10月16日正式投运。','2026-10-17']]){assert.equal(run(text,date).events[0].eventDate,null);}
 const e=run('海上风电项目成功投运并开始供电。','2026-10-16','项目于2026年10月16日投运。').events[0];assert.equal(e.eventDate,null);assert.equal(e.dateQuote,null);assert.deepEqual(e.dateEvidenceIds,[]);
});
