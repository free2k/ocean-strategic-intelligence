import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {ResearchLedger} from '../research/ledger.mjs';
import {FileResearchRepository} from '../research/repositories.mjs';
import {publishCountries,readCountries} from '../research/countries.mjs';
import {attachPublishedRules} from '../published-rules.mjs';
import {publishCountryCase} from '../research/country-cases.mjs';
import {recordReview} from '../research/semantic-review.mjs';
async function setup(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'research-countries-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const ledger=new ResearchLedger(new FileResearchRepository(dir));
 const data={sources:[],entities:[],relations:[],observations:[],documents:[{id:'d',sourceId:'s',title:'项目合作',content:'中国与巴西企业讨论项目合作。',publishedAt:'2026-10-14T15:59:59Z',industry:{status:'accepted',primary:'海洋装备'}}],events:[{id:'event',documentId:'d',title:'项目合作',type:'合作',countries:['CN','BR'],entityIds:[],evidenceIds:['q'],countryRoles:[{countryCode:'CN',role:'company_home',subjectId:'company',evidenceIds:['missing']}]}],evidence:[{id:'q',documentId:'d',quote:'中国与巴西企业讨论项目合作。'}]};
 attachPublishedRules(data,{id:1,config:{rules:[]}});const baseline=await ledger.publish(data,{baseline:true,expectedReleaseId:null});const release=await publishCountries(ledger,baseline.releaseId);return {ledger,data,release};
}
test('country co-occurrence is never promoted to confirmed relationship or unsupported country role',async t=>{
 const {ledger,release}=await setup(t),r=await readCountries(ledger,{countryCodes:'CN,BR',relationMode:'within'});
 assert.equal(r.data.events.length,1);assert.equal(r.data.coOccurrences.length,1);assert.equal(r.data.confirmedRelations.length,0);assert.equal(r.data.roles.length,0);
 assert.equal((await publishCountries(ledger,release.releaseId)).releaseId,release.releaseId);
 await assert.rejects(()=>readCountries(ledger,{countryCodes:'CN',relationMode:'within'}),{code:'INVALID_SCOPE'});
 assert.equal((await readCountries(ledger,{countryCodes:'JP'})).data.events.length,0);
});

test('picker counts distinguish verified cases from legacy events and respect source scope, not selection',async t=>{
 const {ledger,release}=await setup(t),snapshot=await ledger.snapshot(release.snapshotId),e=snapshot.entries[0],quote=e.body.content;
 const content={project:'测试案例',countries:['CN','BR'],overview:'合作讨论线索。',watch:'关注后续。',items:[{id:'role',kind:'role',countryCode:'CN',subject:'讨论方',role:'cross_border_party',title:'参与方',analysis:'原文出现讨论方。',gaps:'没有履约记录。',watch:'关注后续。',facts:[quote],references:[{documentId:e.documentId,bodyVersionId:e.bodyVersionId,quote}]}]};
 const semanticReview=recordReview(content,{summarySupported:true,summaryReason:'测试',items:[{id:'role',supported:true,reason:'测试'}],duplicateGroups:[]},{model:'test',requestId:'test'});
 await publishCountryCase(ledger,{snapshotId:release.snapshotId,content,semanticReview},release.releaseId);
 const r=await readCountries(ledger,{countryCodes:'JP'});assert.equal(r.data.countryEventCoverage.CN,1);assert.equal(r.data.countryCaseCoverage.CN,1);assert.equal(r.data.countryCoverage.CN,2);assert.equal(r.data.caseStudies.length,0);
 const outside=await readCountries(ledger,{sourceId:'missing'});assert.equal(outside.data.countryCoverage.CN,undefined);
 const within=await readCountries(ledger,{countryCodes:'CN,BR,JP',relationMode:'within'});assert.equal(within.data.caseStudies.length,1);
});
test('country source and Beijing date filters restrict events, themes and co-occurrences together',async t=>{
 const {ledger}=await setup(t);
 const r=await readCountries(ledger,{sourceId:'s',from:'2026-10-14',to:'2026-10-14'});assert.equal(r.data.events.length,1);
 for(const query of [{sourceId:'other'},{from:'2026-10-15'},{to:'2026-10-13'}]){const v=await readCountries(ledger,query);assert.equal(v.data.events.length,0);assert.equal(v.data.themes.length,0);assert.equal(v.data.coOccurrences.length,0);}
 await assert.rejects(()=>readCountries(ledger,{from:'2026-02-30'}),{code:'INVALID_SCOPE'});
});
test('full map countries remain selectable without inventing data or a combined dossier',async t=>{
 const {ledger}=await setup(t),r=await readCountries(ledger,{countryCodes:'IS,NO'});
 assert(r.data.countries.length>150);assert.equal(r.data.events.length,0);assert.deepEqual(r.data.dossiers.map(d=>d.countryCode),['IS','NO']);assert(r.data.dossiers.every(d=>d.assessment===null));
 await assert.rejects(()=>readCountries(ledger,{countryCodes:'XX'}),{code:'INVALID_COUNTRY'});
});
test('no new reports retains theme history without inventing closure; historic release remains readable',async t=>{
 const {ledger,data,release}=await setup(t),first=await readCountries(ledger);
 data.documents=[];data.events=[];data.evidence=[];const next=await ledger.publish(data,{expectedReleaseId:release.releaseId}),indexed=await publishCountries(ledger,next.releaseId);
 assert.equal((await readCountries(ledger)).data.events.length,0);
 const registry=await ledger.repository.read(indexed.countryRegistryId);assert.equal(registry.themes[0].id,first.data.themes[0].id);assert.equal(registry.themes[0].versions[0].status,'candidate');
 assert.equal((await readCountries(ledger,{releaseId:release.releaseId})).data.events.length,1);
});

test('overview preserves scope, evidence and counts while full view retains saved history',async t=>{
 const {ledger}=await setup(t);
 for(const scope of [{},{countryCodes:'CN'},{countryCodes:'CN,BR',relationMode:'within'},{sourceId:'unknown'}]){
  const full=await readCountries(ledger,scope),overview=await readCountries(ledger,{...scope,view:'overview'});
  const expected=structuredClone(full);expected.data.themes=expected.data.themes.map(({versions,...theme})=>({...theme,versionCount:versions.length}));assert.deepEqual(overview,expected);
 }
 await assert.rejects(readCountries(ledger,{view:'unknown'}),{code:'INVALID_SCOPE'});
});
