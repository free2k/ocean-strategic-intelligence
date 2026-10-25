import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {countryProductsFixture} from './fixtures/country-products.mjs';
import {readCountries,publishCountries} from '../research/countries.mjs';
import {DashboardData} from '../dashboard-data.mjs';import {DashboardPageCache,normalizeDashboardQuery} from '../dashboard-page.mjs';
import {packDashboard,unpackDashboard} from '../public/dashboard-codec.mjs';
test('dashboard scopes preserve all country counts, reviewed content, references and original publication versions',async t=>{
 const f=await countryProductsFixture(t);let snapshots=0,registries=0,fullReads=0;
 const projected={head:()=>f.repository.head(),read:async id=>{if(/^(snapshot|registry)_/.test(id)){fullReads++;throw Error('Full archive must not be hydrated');}return f.repository.read(id);},isPublished:id=>f.repository.isPublished(id),releaseForSnapshot:id=>f.repository.releaseForSnapshot(id),readDashboardSnapshot:async id=>{snapshots++;return f.repository.read(id);},readCountryOverview:async id=>{registries++;return f.repository.read(id);}};
 const data=new DashboardData(projected),queries=[{},{countryCodes:'NO'},{countryCodes:'NO,SE',relationMode:'within'},{countryCodes:'NO,SE',relationMode:'external'},{countryCodes:'JP'},{sourceId:'source-a'},{sourceId:'source-b'},{topic:'海洋低碳'},{from:'2026-10-14',to:'2026-10-14'},{from:'2026-10-15',to:'2026-10-15'},{sourceId:'missing'},{releaseId:f.emptyRelease.releaseId}];
 for(const query of queries){const actual=await data.page(query),expected=await readCountries(f.ledger,{...query,view:'overview'});assert.deepEqual({data:actual.data,meta:actual.meta},expected);assert.deepEqual(unpackDashboard(JSON.parse(JSON.stringify(packDashboard(actual)))),actual);}
 assert.equal(fullReads,0);assert.equal(snapshots,1);assert.equal(registries,1);
 f.data.documents[0].content+='新一期补充报道。';const published=await f.ledger.publish(f.data,{expectedReleaseId:f.release.releaseId});await publishCountries(f.ledger,published.releaseId);
 const next=await data.page({});assert.ok(next.data.historicalProducts.length>=4);assert.ok(next.data.historicalProducts.every(p=>p.publication.snapshotId===f.release.snapshotId));assert.deepEqual({data:next.data,meta:next.meta},await readCountries(f.ledger,{view:'overview'}));
 const old=await data.page({releaseId:f.release.releaseId});assert.equal(old.data.caseStudies.length,1);assert.equal(old.data.assessments.length,3);
 for(const query of [{view:'full'},{unsupported:''},{countryCodes:'XX'},{countryCodes:'NO',relationMode:'within'},{from:'2026-02-30'},{from:'2026-10-20',to:'2026-10-10'},{releaseId:f.release.releaseId,snapshotId:next.meta.snapshotId}])await assert.rejects(data.page(query));
});
test('dashboard string tables round-trip literal control strings and reject invalid references',()=>{
 const text='同一段原文证据与不可变版本ID。'.repeat(30),value={data:{events:[{id:text,quote:text,literal:'\0!test',empty:null,zero:0}],themes:[[text,'\u00001','\0!']]},meta:{releaseId:text}};
 const packed=packDashboard(value);assert.ok(JSON.stringify(packed).length<JSON.stringify(value).length/2);assert.deepEqual(unpackDashboard(JSON.parse(JSON.stringify(packed))),value);assert.equal(unpackDashboard(value),value);
 for(const value of [{encoding:'dashboard-strings-v1',strings:[],value:'\u00001'},{encoding:'dashboard-strings-v1',strings:[1],value:null}])assert.throws(()=>unpackDashboard(value),/编码无效/);
});
const page=id=>({meta:{releaseId:id,snapshotId:'s',generatedAt:'2026-10-14'},data:{events:[{title:'已发布事件'}],themes:[]},options:{sources:[],topics:[],mapCountries:[]}});
test('dashboard keeps a complete ready view across restart, coalesces reads and replaces releases atomically',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dashboard-cache-'));let release='r1',reads=0,now=0,resolve;const data={ledger:{resolveRelease:async()=>({releaseId:release})},page:async q=>{reads++;if(resolve)await resolve;return page(q.releaseId);}};
 try{const cache=new DashboardPageCache({data,dir,scope:'one',clock:()=>now});await cache.init();assert.equal((await cache.get()).meta.releaseId,'r1');assert.equal((await fs.stat(path.join(dir,'dashboard-page.json'))).mode&0o777,0o600);
  await Promise.all([cache.get({view:'overview',countryCodes:'',relationMode:'external'}),cache.get({})]);assert.equal(reads,1);
  await Promise.all([cache.get({sourceId:'s'}),cache.get({sourceId:'s'})]);assert.equal(reads,2);release='r2';now=31000;let finish;resolve=new Promise(r=>finish=r);assert.equal((await cache.get()).meta.releaseId,'r1');await new Promise(r=>setTimeout(r,0));assert.equal((await cache.get()).meta.releaseId,'r1');finish();await cache.checking;resolve=null;assert.equal((await cache.get()).meta.releaseId,'r2');assert.equal((await cache.get({sourceId:'s'})).meta.releaseId,'r2');assert.equal((await cache.get({releaseId:'r1'})).meta.releaseId,'r1');
  const restored=new DashboardPageCache({dir,scope:'one',data:{ledger:{resolveRelease:()=>new Promise(()=>{})}}});await restored.init();assert.equal((await restored.get()).meta.releaseId,'r2');const other=new DashboardPageCache({dir,scope:'different',data:{ledger:{resolveRelease:async()=>{throw Error('offline');}}}});await other.init();await assert.rejects(other.get());
  assert.deepEqual(normalizeDashboardQuery({view:'overview',relationMode:'external',countryCodes:'SE,NO'}),{countryCodes:'NO,SE'});assert.throws(()=>normalizeDashboardQuery({unsupported:''}));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('first-page theme previews preserve the full search index and lazily return exact scoped evidence',async t=>{
 const {dashboardOverview,dashboardThemes}=await import('../dashboard-overview.mjs'),{recentCountryRows}=await import('../public/country-ranking.mjs'),f=await countryProductsFixture(t),page=await new DashboardData(f.repository).page(),original=page.data.themes[0];
 page.data.themes=Array.from({length:45},(_,i)=>({...original,id:'theme_'+i.toString(16).padStart(64,'0'),aliases:['检索别名 '+i],presentation:{...original.presentation,title:'主题 '+i}}));const sorted=recentCountryRows(page.data),view=dashboardOverview(page);
 assert.equal(view.data.themes.length,45);assert.equal(view.data.themes.filter(t=>!t.previewOnly).length,10);assert.equal(view.data.events.length,page.data.events.length);assert.deepEqual(view.data.events.map(e=>e.countries),page.data.events.map(e=>e.countries));assert.deepEqual(view.data.historicalProducts,page.data.historicalProducts);assert.deepEqual(view.data.assessments,page.data.assessments);assert.deepEqual(view.data.coOccurrences,sorted.coOccurrences);
 for(const [i,theme] of view.data.themes.entries()){assert.deepEqual(theme.recency,sorted.themes[i].recency);assert.deepEqual(theme.aliases,sorted.themes[i].aliases);assert.equal(theme.presentation.title,sorted.themes[i].presentation.title);}
 const ids=view.data.themes.slice(20,40).map(t=>t.id);assert.deepEqual(dashboardThemes(page,ids.join(',')),{data:sorted.themes.slice(20,40),meta:page.meta});assert.throws(()=>dashboardThemes(page,'theme_'+'f'.repeat(64)),{code:'THEME_NOT_FOUND'});assert.throws(()=>dashboardThemes(page,'../private'),{code:'INVALID_SCOPE'});assert.throws(()=>dashboardThemes(page,[...ids,ids[0]].join(',')),{code:'INVALID_SCOPE'});
 assert.deepEqual(unpackDashboard(packDashboard(view)),view);
});
