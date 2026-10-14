// Browser acceptance against a running isolated preview. Does not invoke generation or write source data.
const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const base=process.argv[2]||'http://127.0.0.1:3127',output=process.argv[3]||'.data/real-layout-acceptance';
(async()=>{await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),report={base,startedAt:new Date().toISOString(),scope:'local real captured workspace; functional layout acceptance, not final capacity/performance acceptance',pages:[],errors:[]};
 try{const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));
 for(const [route,ready] of [['home','#home-product-brief'],['library','.brief-cards'],['monitor','#monitor-scope-summary'],['dashboard','#country-theme-results']]){
  const start=Date.now();await p.goto(base+'/#'+route+'?topic=&country=&sourceId=&from=&to=');await p.locator(ready).waitFor();
  const row={route,readyMs:Date.now()-start};
  if(route==='home'){assert.equal(await p.locator('.home-reports article').count(),3);assert.equal(await p.locator('.home-fields a').count(),12);row.sections=await p.locator('#content > section > small').allTextContents();}
  if(route==='library'){assert.equal(await p.locator('.brief-card').count(),6);assert.equal(await p.locator('.brief-cards').evaluate(el=>getComputedStyle(el).display),'grid');assert((await p.locator('.brief-card').first().boundingBox()).height>=80);row.domains=await p.locator('.brief-card strong').allTextContents();await p.locator('.brief-cards').scrollIntoViewIfNeeded();}
  if(route==='monitor'){const positions=await p.evaluate(()=>['monitor-flow','monitor-tools','monitor-summary','object-host'].map(id=>document.getElementById(id).getBoundingClientRect().top));assert(positions.every((y,i)=>!i||y>positions[i-1]));assert.equal(await p.locator('#topic').count(),1);row.regionOrder=['process','filters','summary','objects'];}
  if(route==='dashboard'){assert.equal(await p.locator('#content > section').first().getAttribute('id'),'country-toolbar');assert(await p.locator('.country-options input').count()>150);row.regionOrder=await p.locator('#country-dossier .country-section > h2').allTextContents();assert.deepEqual(row.regionOrder,['国别态势研判','阶段焦点与国别变化','国别关系与战略研判']);}
  await p.screenshot({path:output+'/'+route+'-desktop.png'});await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+' mobile overflow');await p.screenshot({path:output+'/'+route+'-mobile.png'});await p.setViewportSize({width:1440,height:1000});report.pages.push(row);
 }
 assert.deepEqual(report.errors,[]);report.passed=true;report.finishedAt=new Date().toISOString();await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
