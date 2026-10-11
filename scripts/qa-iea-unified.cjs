const {chromium}=require('playwright-core'),fs=require('fs'),assert=require('assert');
(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const c=await b.newContext({storageState:'.data/open-test-session.json',viewport:{width:1500,height:1000}}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));const base='http://49.233.77.111/ocean-intelligence/';
 const get=async path=>{const r=await c.request.get(base+path);assert(r.ok(),path+' '+r.status());return r.json();};
 const data=await get('api/data?sourceId=iea'),catalog=await get('quant/api/catalog?sourceId=iea');assert.equal(data.sources.filter(s=>s.id==='iea').length,1);assert(!data.sources.some(s=>s.method==='authenticated-xlsx'));assert.equal(catalog.ieaSummary.projects,157);assert.equal(catalog.cards.filter(s=>s.renderer?.startsWith('official-')).length,6);
 const excluded=await get('quant/api/catalog?sourceId=boem');assert.equal(excluded.ieaSummary.records,0);
 const dated=await get('quant/api/catalog?sourceId=iea&from=2026-01-01');assert.equal(dated.ieaSummary.projects,0);
 const country=await get('quant/api/catalog?sourceId=iea&country=NO');assert(country.officialRecords.every(r=>r['国家']==='挪威'));
 await p.goto(base+'#analysis',{waitUntil:'networkidle'});await p.locator('#source').selectOption('iea');await p.waitForTimeout(1600);
 assert.equal(await p.locator('[data-tab=iea]').count(),0);await p.locator('[data-card-view][data-type=countryBar]').first().waitFor();
 for(const type of ['statusBar','heatmap','countryBar'])await p.locator('[data-card-view][data-type='+type+']').first().click();
 const cohort=p.locator('[data-cohort]').first();await cohort.selectOption('1');await p.locator('[data-card-view][data-type=dot]').first().click();
 assert.equal(await p.getByText('此图暂未绘制：',{exact:false}).count(),0);
 await p.screenshot({path:'.data/iea-samples/unified-desktop.png',fullPage:true});
 await p.locator('[data-tab=inventory]').click();await p.locator('#kind').selectOption('official');assert((await p.locator('#data-table').innerText()).includes('12023'));await p.getByText('官方工作簿与版本 · 4 份',{exact:true}).click();
 const href=await p.locator('a').filter({hasText:'下载原表'}).first().getAttribute('href');const xlsx=await c.request.get(href);assert(xlsx.ok());assert.equal((await xlsx.body()).subarray(0,2).toString(),'PK');
 await p.locator('[data-tab=charts]').click();await p.setViewportSize({width:390,height:844});await p.waitForTimeout(300);const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);await p.screenshot({path:'.data/iea-samples/unified-mobile.png',fullPage:true});
 assert(!overflow,'mobile overflow');assert.equal(errors.length,0,errors.join('\n'));const result={summary:catalog.ieaSummary,chartPanels:6,charts:['countryBar','statusBar','heatmap','bar','dot'],unifiedSource:true,filtersVerified:['source','country','date'],originalWorkbook:true,overflow,errors};console.log(JSON.stringify(result));fs.writeFileSync('.data/iea-samples/unified-qa.json',JSON.stringify(result,null,2));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
