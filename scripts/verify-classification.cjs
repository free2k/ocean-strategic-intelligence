const {chromium}=require('playwright-core'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const p=await b.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const base=process.argv[2]||'http://127.0.0.1:3127/';if(process.argv.includes('--auth-stdin')){const u=new URL(base);await p.context().addCookies([{name:'ocean_auth',value:require('node:fs').readFileSync(0,'utf8').trim(),domain:u.hostname,path:u.pathname}]);}
 await p.goto(base+'#library');await p.locator('[data-audit-mode=history]').click();await p.locator('#archive-list article').first().waitFor();
 const payload=await(await p.request.get(base+'api/research/replay')).json(),docs=payload.data.documents;
 const accepted=docs.filter(d=>d.classification?.status==='accepted').length;
 assert.equal(await p.locator('[data-list-state=accepted] strong').innerText(),String(accepted));
 await p.locator('.classification-scope summary').click();assert.match(await p.locator('#archive-origin-counts').innerText(),/Mp2RSS/);
 assert(await p.locator('#archive-list .match-group').first().isVisible());
 const first=p.locator('[data-preview-document]').first(),firstTitle=await first.innerText();await first.click();await p.locator('#archive-evidence-pane .reading-article').waitFor();
 assert.equal(await p.locator('dialog[open]').count(),0);assert.equal(await p.locator('#archive-evidence-pane>h3').first().innerText(),firstTitle);
 await p.locator('#archive-evidence-pane').evaluate(el=>el.scrollTop=500);
 const second=p.locator('[data-preview-document]').nth(1),secondTitle=await second.innerText();await second.click();await p.waitForFunction(t=>document.querySelector('#sensing-host')?.shadowRoot?.querySelector('#archive-evidence-pane>h3')?.textContent===t,secondTitle).catch(async()=>{await p.locator('#archive-evidence-pane .reading-article').waitFor()});
 assert.equal(await p.locator('#archive-evidence-pane>h3').first().innerText(),secondTitle);assert.equal(await p.locator('#archive-evidence-pane').evaluate(el=>el.scrollTop),0);
 assert.equal(await p.locator('.evidence-card.is-selected').count(),1);
 await p.locator('#archive-evidence-pane [data-document]').click();await p.locator('dialog[open] .reading-article').waitFor();await p.locator('dialog[open] .reader-footer button').click();
 await p.locator('[data-list-state=excluded]').click();assert.equal(await p.locator('#archive-state').inputValue(),'excluded');assert.equal(await p.locator('#archive-evidence-pane .reading-article').count(),0);
 await p.locator('[data-list-state=all]').click();
 const d=docs.find(d=>d.classification?.method==='llm'&&d.classification?.semantic?.quote);assert(d);await p.locator('#archive-source').selectOption(d.sourceId);await p.locator('#archive-search').fill(d.title);
 assert.match(await p.locator('#archive-list').innerText(),/大模型语义判断/);await p.locator('#archive-list details summary').filter({hasText:'大模型引用'}).click();assert((await p.locator('#archive-list blockquote').innerText()).length>10);
 await p.locator('[data-preview-document]').click();await p.locator('#archive-evidence-pane .reading-article').waitFor();
 await p.locator('.archive-evidence-header').scrollIntoViewIfNeeded();await p.screenshot({path:'.data/classification-redesign-dark.png'});
 await p.locator('#theme').click();await p.locator('.archive-evidence-header').scrollIntoViewIfNeeded();await p.screenshot({path:'.data/classification-redesign-light.png'});
 await p.locator('#archive-rules').click();await p.locator('.rule-domain').first().waitFor();assert.equal(await p.locator('.rule-domain').count(),6);await p.locator('dialog[open] .reader-footer button').click();
 await p.setViewportSize({width:390,height:844});await p.locator('.archive-evidence-header').scrollIntoViewIfNeeded();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:'.data/classification-redesign-mobile.png'});
 assert.deepEqual(errors,[]);console.log('PASS snapshot counts, visible keywords, selected preview/scroll reset, status filters, source reader, model quote, six-domain rules, day/night/mobile');
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
