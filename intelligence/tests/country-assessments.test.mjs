import test from 'node:test';
import assert from 'node:assert/strict';
import {countryProductsFixture,fixtureReview} from './fixtures/country-products.mjs';
import {readCountries} from '../research/countries.mjs';
import {publishWorkspace} from '../research/publish-workspace.mjs';
import {publishDossier} from '../research/dossier-products.mjs';
import {countryProductReleases,productEvidenceInScope} from '../research/country-products.mjs';
import {reviewMatches} from '../research/semantic-review.mjs';

test('global overview includes single and joint country assessments alongside the complete case',async t=>{
 const {ledger}=await countryProductsFixture(t),{data}=await readCountries(ledger);
 assert.equal(data.assessments.length,3);assert.equal(data.caseStudies.length,1);
 assert.deepEqual(data.dossiers.map(d=>d.countryCode),['NO','SE']);assert.equal(data.assessmentStatus,'published');
 assert.equal(data.assessmentCoverage.excludedByFilters,0);assert.equal(data.countryAssessmentCoverage.NO,2);
 const selected=await readCountries(ledger,{countryCodes:'NO,SE',relationMode:'within'});
 assert.equal(selected.data.assessment.scope.countryCodes.length,2);assert.equal(selected.data.assessments.length,3);assert.equal(selected.data.caseStudies.length,1);
});

test('filters match all actual cited evidence, including Beijing boundaries, while uncited inputs do not hide assessments',async t=>{
 const {ledger}=await countryProductsFixture(t);
 for(const query of [{sourceId:'source-a'},{topic:'海洋低碳'},{from:'2026-10-14',to:'2026-10-14'},{sourceId:'source-a',topic:'海洋低碳',from:'2026-10-14',to:'2026-10-14'}]){
  const {data}=await readCountries(ledger,query);assert.equal(data.assessments.length,2,JSON.stringify(query));assert.equal(data.caseStudies.length,0);assert.equal(data.assessmentCoverage.excludedByFilters,2);
  assert(data.assessments.every(p=>p.inputVersions.length===2));
 }
 const nextDay=await readCountries(ledger,{from:'2026-10-15',to:'2026-10-15'});assert.equal(nextDay.data.assessments.length,1);assert.equal(nextDay.data.assessments[0].subject,'SE');
 const absent=await readCountries(ledger,{sourceId:'missing'});assert.equal(absent.data.assessmentStatus,'filtered_out');assert.equal(absent.data.assessmentCoverage.excludedByFilters,4);
 const unrelated=await readCountries(ledger,{countryCodes:'CN'});assert.equal(unrelated.data.assessmentStatus,'not_published');assert.equal(unrelated.data.assessmentCoverage.excludedByFilters,0);
});

test('a new snapshot retains discoverable historical assessments and cases pinned to their original publication',async t=>{
 const {ledger,repository,data,release,entries,quotes}=await countryProductsFixture(t);
 data.generatedAt='2026-10-17T00:00:00Z';data.documents[0].content='此版本已替换正文，不包含原始引用。';data.documents[0].sourceId='changed-source';data.documents[0].industry.primary='海洋装备';data.documents[0].publishedAt='2026-10-17T00:00:00Z';
 await publishWorkspace(repository,data);
 const latest=await readCountries(ledger);assert.equal(latest.data.events.length,1);assert.equal(latest.data.assessments.length,0);assert.equal(latest.data.caseStudies.length,0);assert.equal(latest.data.historicalProducts.length,4);assert.equal(latest.data.assessmentStatus,'historical_available');assert.equal(latest.data.confirmedRelations.length,0);
 assert(latest.data.historicalProducts.every(p=>p.publication.historical&&p.publication.snapshotId===release.snapshotId));
 const historic=await readCountries(ledger,{sourceId:'source-a',topic:'海洋低碳',from:'2026-10-14',to:'2026-10-14'});assert.equal(historic.data.historicalProducts.length,2);
 for(const p of latest.data.historicalProducts){assert(reviewMatches(p.content,p.semanticReview));for(const r of p.content.items.flatMap(i=>i.references)){
  const body=await ledger.document(r.documentId,r.bodyVersionId,{releaseId:p.publication.releaseId});assert(body.data.content.includes(r.quote));
 }}
 const old=await ledger.document('d0',entries[0].bodyVersionId,{releaseId:release.releaseId});assert.equal(old.data.content,quotes[0]);
 const pinned=await readCountries(ledger,{releaseId:release.releaseId});assert.equal(pinned.data.assessments.length,3);assert.equal(pinned.data.caseStudies.length,1);assert.equal(pinned.data.historicalProducts.length,0);
});

test('revisions remain visible as history, later releases never leak into a pinned historical page',async t=>{
 const {ledger,release,emptyRelease,drafts}=await countryProductsFixture(t);
 const next=structuredClone(drafts[0]);next.content.overview='后续保存的有限研判。';next.revisionReason='补充观察边界';next.semanticReview=fixtureReview(next.content);
 await publishDossier(ledger,next,release.releaseId);
 const latest=await readCountries(ledger);assert.equal(latest.data.assessments.length,3);assert.equal(latest.data.historicalProducts.length,1);assert.equal(new Set([...latest.data.assessments,...latest.data.caseStudies,...latest.data.historicalProducts].map(p=>p.productId)).size,5);
 const old=await readCountries(ledger,{releaseId:emptyRelease.releaseId});assert.equal(old.data.assessments.length,0);assert.equal(old.data.historicalProducts.length,0);
});

test('history stays available before the new country index is ready and after many releases',async t=>{
 const {ledger,repository,data,release}=await countryProductsFixture(t);let head=release;
 for(let i=0;i<23;i++){data.generatedAt=new Date(Date.UTC(2026,9,17,0,i)).toISOString();head=await ledger.publish(data,{expectedReleaseId:head.releaseId});}
 const result=await readCountries(ledger);assert.equal(result.data.historicalProducts.length,4);assert.match(result.data.scopeWarning,/索引尚未就绪/);
 const chain=await countryProductReleases(repository,head);assert(chain.length>23);
});

test('evidence matching rejects missing, unknown-date, partial and mismatched document versions',()=>{
 const product={content:{items:[{references:[{documentId:'d',bodyVersionId:'original'}]}]}},entry={documentId:'d',bodyVersionId:'original',body:{sourceId:'a',publishedAt:null},classification:{primary:'海洋低碳'}};
 assert(productEvidenceInScope(product,[entry]));assert(!productEvidenceInScope(product,[entry],{start:0}));assert(!productEvidenceInScope(product,[{...entry,bodyVersionId:'revised'}]));assert(!productEvidenceInScope(product,[]));assert(!productEvidenceInScope({content:{items:[]}},[entry]));
});

test('every matching published product stays discoverable across the country/filter/version matrix',async t=>{
 const {ledger,repository,data,release}=await countryProductsFixture(t);
 data.generatedAt='2026-10-17T00:00:00Z';await publishWorkspace(repository,data);
 const scopes=[{query:{},keys:['NO','SE','NO,SE','case']},{query:{countryCodes:'NO'},keys:['NO','NO,SE','case']},{query:{countryCodes:'SE'},keys:['SE','NO,SE','case']},{query:{countryCodes:'NO,SE',relationMode:'within'},keys:['NO','SE','NO,SE','case']},{query:{countryCodes:'CN'},keys:[]}];
 const filters=[{query:{},keys:['NO','SE','NO,SE','case']},{query:{sourceId:'source-a'},keys:['NO','NO,SE']},{query:{sourceId:'source-b'},keys:['SE']},{query:{topic:'海洋低碳'},keys:['NO','NO,SE']},{query:{from:'2026-10-14',to:'2026-10-14'},keys:['NO','NO,SE']},{query:{from:'2026-10-15',to:'2026-10-15'},keys:['SE']},{query:{sourceId:'missing'},keys:[]}];
 for(const version of [{releaseId:release.releaseId},{}])for(const scope of scopes)for(const filter of filters){
  const query={...version,...scope.query,...filter.query},result=await readCountries(ledger,query),products=[...result.data.assessments,...result.data.caseStudies,...result.data.historicalProducts];
  const expected=scope.keys.filter(key=>filter.keys.includes(key)).sort(),actual=products.map(p=>p.productType==='country_case'?'case':p.scope.countryCodes.join(',')).sort();
  assert.deepEqual(actual,expected,JSON.stringify(query));
  if(expected.length)assert(['published','historical_available'].includes(result.data.assessmentStatus),JSON.stringify(query));
 }
});
