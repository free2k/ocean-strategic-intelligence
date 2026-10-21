// Run against a deployed instance; never needs a password or a valid session.
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
(async()=>{
 const base=process.env.TEST_BASE_URL||'http://49.233.77.111/ocean-intelligence/';
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  for(const stale of [false,true]){
   const context=await browser.newContext();
   if(stale)await context.addCookies([{name:'ocean_auth',value:'1.invalid',url:base}]);
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('response',r=>{if(r.status()>=400)console.log(r.status(),new URL(r.url()).pathname);});
   await page.goto(base+'#home');
   try{await page.locator('#login').waitFor({state:'visible',timeout:15000});}catch(error){console.log(JSON.stringify({errors,notice:await page.locator('#notice').textContent()}));throw error;}
   const asset=await context.request.get(base+'quant/chart-views.js');
   assert.equal(asset.status(),200);
   assert.match(asset.headers()['content-type'],/javascript/);
   for(const route of ['api/data?projection=summary','quant/api/catalog','quant/api/iea-data']){
    assert.equal((await context.request.get(base+route)).status(),401,route);
   }
   assert.deepEqual(errors,[]);
   console.log(JSON.stringify({session:stale?'invalid':'missing',loginVisible:true,privateDataProtected:true}));
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
