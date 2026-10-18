import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {countryProductsFixture} from './fixtures/country-products.mjs';
import {readCountries} from '../research/countries.mjs';
import {publishWorkspace} from '../research/publish-workspace.mjs';
import {mountCountryDossier,clearCountryCache} from '../public/country-dossier.js';
import {parseRoute,routeHash} from '../public/navigation.js';
import {countryPageLink} from '../public/country-assessment.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function mount(t,ledger,options={},response=null){
 const previous={document:globalThis.document,fetch:globalThis.fetch};
 const {document,window}=parseHTML('<html><body><section id="toolbar"></section><section id="host"></section><dialog id="detail"><div id="detail-body"></div></dialog></body></html>');
 globalThis.document=document;Object.defineProperty(document,'activeElement',{value:document.body});
 const dialog=document.querySelector('dialog');dialog.showModal=()=>dialog.open=true;dialog.close=()=>dialog.open=false;
 const requests=[];globalThis.fetch=async input=>{
  const url=new URL(input,'http://localhost/');requests.push(url);
  try{
   if(url.pathname==='/api/research/countries')return Response.json(response||await readCountries(ledger,Object.fromEntries(url.searchParams)));
   const match=url.pathname.match(/^\/api\/document\/([^/]+)\/versions\/([^/]+)$/);assert(match);
   return Response.json(await ledger.document(decodeURIComponent(match[1]),decodeURIComponent(match[2]),Object.fromEntries(url.searchParams)));
  }catch(error){return Response.json({message:error.message},{status:error.status||500});}
 };
 clearCountryCache();let loaded;const ready=new Promise(resolve=>loaded=resolve),host=document.querySelector('#host');
 const dispose=mountCountryDossier(host,{toolbar:document.querySelector('#toolbar'),dictionary:[{code:'NO',name:'挪威'},{code:'SE',name:'瑞典'},{code:'CN',name:'中国'}],onLoading:status=>{if(!status.loading)loaded(status);},...options});
 t.after(()=>{dispose();globalThis.document=previous.document;globalThis.fetch=previous.fetch;clearCountryCache();});
 const status=await ready;await tick();assert(!status.error,status.error);
 return {host,document,requests,click:async element=>{element.dispatchEvent(new window.Event('click',{bubbles:true}));await tick();if(element.dataset.countryRef)for(let i=0;i<200&&document.querySelector('#detail-body').textContent==='正在读取同版本原文…';i++)await new Promise(r=>setTimeout(r,5));}};
}

test('global, multi-country overview and country tabs render assessments and the case together',async t=>{
 const {ledger}=await countryProductsFixture(t),view=await mount(t,ledger,{countryCodes:['NO','SE']});
 assert.equal(view.host.querySelectorAll('.saved-dossier').length,3);assert.equal(view.host.querySelectorAll('.country-case').length,1);
 assert(!view.host.textContent.includes('当前范围尚无通过复核的研判'));
 await view.click(view.host.querySelector('[data-dossier-country="SE"]'));assert.equal(view.host.querySelectorAll('.saved-dossier').length,2);assert.equal(view.host.querySelectorAll('.country-case').length,1);
 await view.click(view.host.querySelector('[data-assessment-overview]'));assert.equal(view.host.querySelectorAll('.saved-dossier').length,3);
});

test('the global page also renders a joint assessment without a single-country counterpart',async t=>{
 const {ledger,release}=await countryProductsFixture(t);
 // Use a valid published response with only the joint assessment in the displayed
 // set, reproducing the old frontend branch that ignored this returned product.
 const result=await readCountries(ledger,{releaseId:release.releaseId});result.data.assessments=result.data.assessments.filter(p=>p.scope.countryCodes.length>1);result.data.caseStudies=[];result.data.dossiers=[];
 const view=await mount(t,ledger,{},result);
 assert.equal(view.host.querySelectorAll('.saved-dossier').length,1);assert.match(view.host.textContent,/挪威、瑞典/);
});

test('history is visible after publication, every evidence button opens its original body version',async t=>{
 const {ledger,repository,data,release,quotes}=await countryProductsFixture(t);
 data.generatedAt='2026-10-17T00:00:00Z';data.documents[0].content='新版正文已经变化。';await publishWorkspace(repository,data);
 const view=await mount(t,ledger);assert.match(view.host.textContent,/历史成果 4 项/);assert(view.host.querySelector('.country-product-history').hasAttribute('open'));assert.equal(view.host.querySelectorAll('.country-historical-product').length,4);
 assert([...view.host.querySelectorAll('.country-historical-product > summary')].every(s=>/版本 [a-f0-9]{12}/.test(s.textContent)));
 const buttons=[...view.host.querySelectorAll('.country-historical-product [data-country-ref]')];assert(buttons.length>=5);
 for(const button of buttons){
  assert.notEqual(button.dataset.release,(await ledger.latest()).releaseId);
  await view.click(button);assert(!/不可|不存在/.test(view.document.querySelector('#detail-body').textContent));
  assert(quotes.some(quote=>view.document.querySelector('#detail-body').textContent.includes(quote)),view.document.querySelector('#detail-body').textContent);
 }
 const link=view.host.querySelector('.country-product-version a'),route=parseRoute(new URL(link.href,'http://localhost/').hash);assert(route.releaseId);assert(!route.error);assert.equal(parseRoute(routeHash(route)).releaseId,route.releaseId);
 assert(view.host.textContent.includes(release.snapshotId));
});

test('filters show the matching assessment, explain excluded products, and preserve country and version when clearing filters',async t=>{
 const {ledger,release}=await countryProductsFixture(t),view=await mount(t,ledger,{countryCodes:['NO'],query:'sourceId=source-a&topic=海洋低碳',releaseId:release.releaseId});
 assert.equal(view.host.querySelectorAll('.saved-dossier').length,2);assert.equal(view.host.querySelectorAll('.country-case').length,0);assert.match(view.host.textContent,/完整引用证据不符合/);
 const url=new URL(view.host.querySelector('.country-filter-explanation a').href,'http://localhost/'),route=parseRoute(url.hash);
 assert.equal(route.scope.topic,'');assert.equal(route.scope.sourceId,'');assert.deepEqual(route.countryCodes,['NO']);assert.equal(route.releaseId,release.releaseId);
 assert.equal(view.requests[0].searchParams.get('releaseId'),release.releaseId);assert(view.host.querySelector('.country-view-version').textContent.includes(release.releaseId));
});

test('historic dashboard links, invalid versions and return-to-latest keep route and scope consistent',()=>{
 const releaseId='release_'+'a'.repeat(64),url=countryPageLink({selected:['NO','SE'],mode:'within',releaseId,query:'topic=海洋低碳&sourceId=source-a&from=2026-10-14'}),route=parseRoute(url);
 assert(!route.error);assert.equal(route.releaseId,releaseId);assert.equal(parseRoute(routeHash(route)).releaseId,releaseId);assert.equal(route.scope.topic,'海洋低碳');
 assert.equal(parseRoute(countryPageLink({selected:['NO']})).releaseId,null);assert.equal(parseRoute('#dashboard?releaseId=invalid').releaseId,null);
});
