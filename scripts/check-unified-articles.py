from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Users/key/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
    context=browser.new_context(storage_state='.data/discovery-test-session.json',viewport={'width':1440,'height':1000})
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://49.233.77.111/wechat/subscriptions',wait_until='networkidle')
    table=page.get_by_role('table',name='订阅源列表');table.wait_for()
    for width in [1440,1280,1024]:
        page.set_viewport_size({'width':width,'height':1000})
        page.wait_for_timeout(100)
        assert table.evaluate('(t)=>t.parentElement.scrollWidth<=t.parentElement.clientWidth+2'),width
        assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+2'),width
        row=table.locator('tbody tr').first
        actions=row.get_by_role('button',name='立即同步',exact=True).bounding_box()
        bounds=table.bounding_box()
        assert actions['x']+actions['width']<=bounds['x']+bounds['width']+2
    page.set_viewport_size({'width':1440,'height':1000})
    page.screenshot(path='.data/compact-subscriptions.png')
    source=next(s for s in page.request.get('http://49.233.77.111/api/subscriptions').json()['list'] if s['payload']['name']=='中国能源报')
    row=table.get_by_role('row').filter(has=page.get_by_role('link',name='中国能源报',exact=True))
    row.get_by_role('link',name='查看文章',exact=True).click()
    group=page.get_by_role('group',name='文章来源');group.wait_for()
    assert group.get_by_role('button',name='全部来源',exact=False).get_attribute('aria-pressed')=='true'
    all_data=page.request.get('http://49.233.77.111/api/subscriptions/items',params={'source':source['id']}).json()
    assert all_data['total']==source['count']+source['legacy_count']
    group.get_by_role('button',name='历史文章',exact=False).click()
    page.wait_for_function('()=>document.querySelectorAll("article").length>0&&[...document.querySelectorAll("article")].every(a=>a.innerText.includes("历史文章 · 非 Mp2RSS"))')
    page.locator('article').first.get_by_text('查看分类依据',exact=True).click()
    assert '历史分类方式' in page.locator('article').first.inner_text()
    assert '本项未调用大模型' not in page.locator('article').first.inner_text()
    first_title=page.locator('article > a').first.inner_text()
    page.get_by_role('button',name='下一页',exact=True).click()
    page.wait_for_function('(title)=>document.querySelector("article > a")?.innerText!==title',arg=first_title)
    page.reload(wait_until='networkidle')
    assert group.get_by_role('button',name='历史文章',exact=False).get_attribute('aria-pressed')=='true'
    assert 'page=2' in page.url
    page.screenshot(path='.data/unified-history-articles.png')
    group.get_by_role('button',name='Mp2RSS',exact=False).click()
    page.wait_for_function('()=>[...document.querySelectorAll("article")].every(a=>!a.innerText.includes("历史文章 · 非 Mp2RSS"))')
    assert 'page=2' not in page.url
    assert not errors,errors
    print('Desktop row fits at 1024/1280/1440; unified counts, history labels, classification, pagination and reload passed')
    browser.close()
