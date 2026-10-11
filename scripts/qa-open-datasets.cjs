const fs=require('fs'),{chromium}=require('playwright-core');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const context=await browser.newContext({storageState:'.data/open-test-session.json',viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://49.233.77.111/ocean-intelligence/quant/?'+new URLSearchParams({topic:'宏观政策'}),{waitUntil:'networkidle'});await page.waitForFunction(()=>window.previewChartCount>0);
 await page.waitForFunction(()=>document.querySelectorAll('[data-template="timeline"]').length===3);
 const desktopCharts=await page.locator('.chart-card').count();await page.screenshot({path:'.data/open-stage/macro-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.data/open-stage/macro-mobile.png',fullPage:true});
 const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
 await page.setViewportSize({width:1440,height:1000});await page.goto('http://49.233.77.111/ocean-intelligence/#analysis',{waitUntil:'networkidle'});await page.locator('#topic').selectOption('宏观政策');await page.locator('#quant-native .chart-card').first().waitFor();await page.waitForFunction(()=>document.querySelector('#quant-native')?.shadowRoot?.querySelectorAll('[data-template="timeline"]').length===3);
 const integratedCharts=await page.locator('#quant-native .chart-card').count();await page.screenshot({path:'.data/open-stage/integrated-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});const integratedOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
 console.log(JSON.stringify({desktopCharts,mobileOverflow,integratedCharts,integratedOverflow,errors}));if(errors.length||mobileOverflow||integratedOverflow)process.exitCode=1;
}finally{await browser.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
