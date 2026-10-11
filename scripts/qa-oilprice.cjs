const fs=require('fs'),{chromium}=require('playwright-core');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const context=await browser.newContext({storageState:'.data/mp2rss/session.json',viewport:{width:1440,height:1000}}),base='http://49.233.77.111',page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message.slice(0,120)));
 await page.goto(base+'/wechat/subscriptions',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'外部文章与图表证据（X / RSS）'}).waitFor();
 const r=await context.request.get(base+'/api/subscriptions/evidence');const evidence=await r.json();
 if(!evidence.oilprice?.feeds?.length)throw Error('OilPrice status missing');
 const sources=await context.request.get(base+'/api/rss/sources');const data=await sources.json();if(data.list.filter(s=>s.fakeid?.startsWith('oilprice-')).length!==2)throw Error('RSS sources missing');
 const guarded=await context.request.post(base+'/api/rss/sync',{data:{sourceId:data.list.find(s=>s.fakeid==='oilprice-main').id}});if(guarded.status()!==409)throw Error('Summary-only feed must not be imported as full text');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.data/oilprice/mobile.png',fullPage:true});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 const result={evidenceAPI:r.status(),rssAPI:sources.status(),summaryGuard:guarded.status(),feeds:evidence.oilprice.feeds.map(f=>({name:f.name,status:f.status,count:f.count})),pageErrors:errors,mobileOverflow:overflow};
 fs.writeFileSync('.data/oilprice/ui-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(errors.length||overflow)process.exitCode=1;
}finally{await browser.close();}})().catch(()=>{console.error('OilPrice UI verification failed');process.exitCode=1;});
