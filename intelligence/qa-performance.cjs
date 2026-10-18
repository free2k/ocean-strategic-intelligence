// Read-only browser smoke test. Supply a temporary session cookie on stdin.
// PLAYWRIGHT_MODULE and CHROME_PATH support machines with different runtimes.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
(async()=>{
 let token='';for await(const chunk of process.stdin){token+=chunk;if(token.includes('\n'))break;}
 const url=new URL(process.env.INTEL_TEST_URL||'http://127.0.0.1:3101/');
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  if(token.trim())await context.addCookies([{name:'ocean_auth',value:token.trim(),domain:url.hostname,path:url.pathname,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage(),errors=[],timings=[];page.on('pageerror',e=>errors.push(e.message));
  const started=Date.now();await page.goto(url.href,{waitUntil:'domcontentloaded'});await page.waitForSelector('#content .metrics',{timeout:60000});
  const initialMs=Date.now()-started;
  for(const tab of ['sources','library','events','analysis','research','graph','dashboard']){
   const start=Date.now();await page.locator('#nav [data-tab="'+tab+'"]').click();
   await page.waitForFunction(t=>document.body.dataset.view===t,tab);
   const ms=Date.now()-start;timings.push({tab,ms});assert(ms<1000,tab+' navigation waited for data');
   if(tab==='analysis'){
    await page.waitForFunction(()=>document.querySelector('#quant-native')?.shadowRoot?.querySelector('.chart-card'),null,{timeout:45000});
    const root=page.locator('#quant-native');assert.equal(await root.locator('.data-details tbody tr').count(),0);
    await root.locator('.data-details summary').first().click();await root.locator('.data-details tbody tr').first().waitFor();
   }
  }
  await page.locator('#nav [data-tab="library"]').click();
  const topic=await page.locator('#topic option').nth(1).getAttribute('value');
  const responsePromise=page.waitForResponse(r=>r.url().includes('/api/data?')&&new URL(r.url()).searchParams.get('topic')===topic);
  await page.locator('#topic').selectOption(topic);const scoped=await (await responsePromise).json();
  assert(scoped.documents.every(d=>d.topic===topic),'filter returned articles from another topic');
  await page.waitForFunction(n=>document.querySelector('#scope-note').textContent.includes('文章 / 文档 '+n+' 篇'),scoped.documents.length);
  await page.locator('#reset').click();await page.waitForFunction(()=>document.querySelector('#topic').value==='');
  const documentResponse=page.waitForResponse(r=>r.url().includes('/api/document/'));
  await page.locator('#content [data-document]').first().click();await documentResponse;await page.locator('#detail-body .evidence').first().waitFor();await page.locator('#close-detail').click();
  // Expire only the browser read cache and simulate a slow GET, without any writes.
  await page.route('**/api/data?*',async route=>{await new Promise(resolve=>setTimeout(resolve,3000));await route.continue();});
  await page.evaluate(()=>{const now=Date.now();Date.now=()=>now+120000;});
  await page.locator('#nav [data-tab="research"]').click();await page.locator('#question').fill('保留尚未提交的研究问题');
  await page.waitForTimeout(5000);assert.equal(await page.locator('#question').inputValue(),'保留尚未提交的研究问题');
  for(const tab of ['sources','library','events'])await page.locator('#nav [data-tab="'+tab+'"]').click();
  await page.waitForTimeout(3500);assert.equal(await page.locator('body').getAttribute('data-view'),'events');
  assert.match(await page.locator('#content').innerText(),/行业动态监测/);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({initialMs,timings,slowReadInputPreserved:true,rapidNavigation:true,lazyEvidence:true,filters:true,documentEvidence:true,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
