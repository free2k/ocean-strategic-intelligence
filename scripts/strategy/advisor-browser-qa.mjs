// Production permits advice, confirmation and validation only. Saving is localhost-only.
import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.STRATEGY_ADVISOR_QA_URL || 'http://127.0.0.1:3225/';
const out=process.env.STRATEGY_ADVISOR_QA_OUT || '/tmp/strategy-advisor-browser';
const local=new URL(base).hostname==='127.0.0.1', save=local&&process.env.STRATEGY_ADVISOR_QA_SAVE==='true';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Users/guangyi/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1050}});
if(process.env.STRATEGY_ADVISOR_QA_TOKEN)await context.addCookies([{name:'ocean_auth',value:process.env.STRATEGY_ADVISOR_QA_TOKEN,url:base,httpOnly:true,sameSite:'Lax'}]);
const page=await context.newPage(),errors=[],forbidden=[];let saves=0;
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(r.method()!=='POST')return;const pathname=new URL(r.url()).pathname;if(/\/api\/strategy\/studies(?:$|\/)/.test(pathname)){saves++;if(!save)forbidden.push(pathname);}else if(!/\/api\/(login|strategy\/(advice(?:\/confirm)?|validate))$/.test(pathname))forbidden.push(pathname);});
const field=p=>page.locator(`[data-path="${p}"]`), stored=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('ocean-strategy-draft-v2')));
const question='美国联邦海域海湾原油产量各期与历史基期相比如何变化？仅描述已观测数据。';
const waitAdvice=()=>page.waitForFunction(()=>{const d=JSON.parse(sessionStorage.getItem('ocean-strategy-draft-v2')||'null');return !!d?.methodAdvice?.result;},undefined,{timeout:70000});
try{
 await page.goto(base+'#research');
 if(!process.env.STRATEGY_ADVISOR_QA_TOKEN){await page.locator('#password').fill('strategy-local-test');await page.locator('#login-form button').click();}
 await page.locator('.strategy-entry').first().waitFor({timeout:60000});
 const catalog=await page.evaluate(async()=>await(await fetch('api/strategy/catalog')).json());
 await page.locator('[data-strategy-new]').click();await field('title').fill(question);
 await field('scope.topic').selectOption('海洋油气');await field('scope.sourceId').selectOption('eia');
 await page.locator('[data-country-picker] summary').click();await page.locator('[data-country="US"]').check();await page.locator('[data-country-picker] summary').click();
 await page.locator('#strategy-tab-methods').click();await waitAdvice();
 const advice=(await stored()).methodAdvice.result;
 assert.equal(advice.mode,'ai',advice.notice);assert.ok(advice.elements.goal);assert.equal(advice.canExecute,false);
 assert.ok(advice.candidates.every(c=>catalog.methods.some(m=>m.id===c.methodId)));
 assert.equal((await stored()).taskType,'evaluation');assert.equal(saves,0);
 const candidate=advice.candidates.find(c=>c.methodId==='growth')||advice.candidates.find(c=>c.engineStatus==='accepted'&&c.taskType==='statistics'&&c.series.length);
 assert.ok(candidate,'Expected a registered statistical method with real source data');
 const source=candidate.series.find(s=>s.id==='eia-offshore-crude');assert.ok(source);
 assert.match(await page.locator('[data-method-advisor]').innerText(),/推荐理由/);
 const picker=page.locator(`[data-advisor-dataset="${candidate.methodId}"]`);await picker.selectOption(source.id);
 await page.locator(`[data-adopt-advice="${candidate.methodId}"]`).click();
 await page.locator('[data-method-selection-status]').waitFor();
 let draft=await stored();assert.equal(draft.method,candidate.methodId);assert.equal(draft.taskType,'statistics');assert.equal(draft.datasetId,source.id);assert.equal(draft.methodSelection.mode,'ai-assisted');assert.equal(draft.confirmed,false);assert.equal(saves,0);
 await page.locator('.strategy-steps [data-step="1"]').click();await field('comparable').selectOption('true');await field('constraintsConfirmed').selectOption('true');
 await page.locator('[data-next="2"]').click();await field('confirmed').selectOption('true');
 await page.locator('[data-action="validate"]').click();await page.getByText('输入与方法前提通过；可在下一步计算保存').waitFor();
 await page.locator('[data-next="3"]').click();assert.equal(await page.locator('#strategy-form [type="submit"]').isEnabled(),true);
 let record;
 if(save){const response=page.waitForResponse(r=>r.url().endsWith('/api/strategy/studies')&&r.request().method()==='POST');await page.locator('#strategy-form [type="submit"]').click();record=await(await response).json();assert.equal(record.persistence.saved,true);assert.equal(record.methodSelection.mode,'ai-assisted');assert.equal(record.methodSelection.token,undefined);assert.equal(record.input.rows[0].value,100);await fs.writeFile(out+'/saved-engineering-study.json',JSON.stringify(record,null,2));}
 await page.locator('.strategy-steps [data-step="0"]').click();await field('title').fill(question+' 更新研究问题。');
 assert.equal((await stored()).methodSelection,undefined);
 await page.locator('.strategy-steps [data-step="3"]').click();assert.equal(await page.locator('#strategy-form [type="submit"]').isDisabled(),true);
 await page.locator('.strategy-steps [data-step="0"]').click();await field('title').fill(question);await page.locator('#strategy-tab-methods').click();
 await page.locator('[data-method-view="all"]').click();await page.locator('[data-method-search]').fill('投资回报');
 assert.match(await page.locator('#strategy-method-list').innerText(),/净现值/);
 assert.match(await page.locator('#strategy-method-search-help').innerText(),/无需填写研究任务编号/);
 await page.locator('[data-method-search]').fill('');await page.locator('[data-method-view="current"]').click();
 if(local){
  await page.locator('[data-strategy-new]').click();await field('title').fill('未来一年海上原油产量如何预测？');await page.locator('#strategy-tab-methods').click();await waitAdvice();
  const future=(await stored()).methodAdvice.result.candidates[0];assert.equal(future.engineStatus,'planned');assert.equal(future.canRunAfterReview,false);
  await page.locator(`[data-adopt-advice="${future.methodId}"]`).click();await page.locator('[data-method-selection-status]').waitFor();await page.locator('[data-next="3"]').click();assert.equal(await page.locator('#strategy-form [type="submit"]').isDisabled(),true);
  await page.locator('[data-strategy-new]').click();await field('title').fill('三种海上制氢技术路线如何综合排序？');await page.locator('#strategy-tab-methods').click();await waitAdvice();
  const missing=(await stored()).methodAdvice.result.candidates[0];assert.equal(missing.dataStatus,'needs-data');assert.equal(missing.canRunAfterReview,false);
  assert.ok((await stored()).matrix.flat().every(v=>v===null));
 }
 for(const width of [1440,1024,390])for(const theme of ['dark','light']){
  await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.body.classList.toggle('light',t==='light'),theme);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:out+`/method-advisor-${theme}-${width}.png`,fullPage:true});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
 const result={passed:true,mode:advice.mode,model:advice.model,registeredCandidates:advice.candidates.map(c=>c.methodId),selectedMethod:candidate.methodId,selectedDataset:source.id,sourcePeriods:source.count,checked:['AI interpretation','task remains unchanged until adoption','real data matching','independent engine status','explicit method confirmation','no calculation on adoption','final source review','changed question invalidates receipt','clear method search','responsive dark/light layouts',...(local?['planned engine remains disabled','missing matrix stays missing']:[])],viewports:[1440,1024,390],savedStudies:saves,pageErrors:errors};
 await fs.writeFile(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
