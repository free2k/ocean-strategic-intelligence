const fs=require('fs'),{chromium}=require('playwright-core');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
const remote=process.argv.includes('--remote'),base=remote?'http://49.233.77.111/ocean-intelligence/quant/':'http://127.0.0.1:3127/',context=await browser.newContext({...(remote?{storageState:'.data/open-test-session.json'}:{}),viewport:{width:1500,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(base,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.previewChartCount>0);await page.locator('[data-tab="templates"]').click();await page.waitForFunction(()=>[...document.querySelectorAll('.demo-chart')].length===16&&[...document.querySelectorAll('.demo-chart')].every(el=>window.echarts.getInstanceByDom(el)));
for(const button of await page.locator('[data-demo]').all()){await button.click();}
await page.screenshot({path:'.data/open-stage/templates-desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.data/open-stage/templates-mobile.png',fullPage:true});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
await page.locator('[data-tab="charts"]').click();const hiddenZero=await page.locator('.chart-card').filter({hasText:'GULLFAKS：净天然气产量'}).count();await page.locator('#toggle-constant').click();const expandedZero=await page.locator('.chart-card').filter({hasText:'GULLFAKS：净天然气产量'}).count();
console.log(JSON.stringify({demos:16,allTypeButtonsTested:true,overflow,hiddenZero,expandedZero,errors}));if(errors.length||overflow||hiddenZero!==0||expandedZero!==1)process.exitCode=1;
}finally{await browser.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
