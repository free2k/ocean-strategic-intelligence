from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Users/key/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
    context=browser.new_context(storage_state='.data/discovery-test-session.json',viewport={'width':1440,'height':1000})
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://49.233.77.111/wechat/subscriptions',wait_until='networkidle')
    data=page.request.get('http://49.233.77.111/api/subscriptions').json()
    missing=[s for s in data['list'] if s['present'] and s['payload']['platform']=='mp' and s['count']>s['ready']]
    assert missing,'Expected real missing-body articles for UI verification'
    account=missing[0]
    row=page.get_by_role('table',name='订阅源列表').get_by_role('row').filter(has=page.get_by_role('link',name=account['payload']['name'],exact=True))
    row.get_by_role('link',name='篇待补正文',exact=False).click()
    page.get_by_role('button',name='手动补充正文',exact=True).first.wait_for()
    result=page.request.get('http://49.233.77.111/api/subscriptions/items',params={'source':account['id'],'body':'missing'}).json()
    assert result['total']==account['count']-account['ready']
    assert all(a['content_status']!='complete' for a in result['items'])
    assert '账号共 '+str(account['count'])+' 篇' in page.locator('header').filter(has=page.get_by_role('heading',name=account['payload']['name'],exact=True)).inner_text()
    page.get_by_role('button',name='手动补充正文',exact=True).first.click()
    page.get_by_placeholder('粘贴文章正文').wait_for()
    assert page.get_by_role('button',name='保存并重新分类',exact=True).is_disabled()
    # Do not submit fabricated content to live articles; database persistence is tested in an isolated schema.
    page.wait_for_timeout(400)
    page.screenshot(path='.data/manual-body-ui.png')
    page.keyboard.press('Escape')
    invalid=page.request.post('http://49.233.77.111/api/subscriptions/body',data={'itemId':result['items'][0]['item_id'],'content':'短文本'})
    assert invalid.status==400
    page.goto('http://49.233.77.111/wechat/rss',wait_until='networkidle')
    page.get_by_role('heading',name='RSS 与外部采集源').wait_for()
    rss=page.request.get('http://49.233.77.111/api/rss/sources').json()['list']
    urls=[s['alias'] for s in rss];assert len(urls)==len(set(urls))
    assert all('cn.todayrss.com' not in u for u in urls)
    nl=next(s for s in rss if s['name']=='Northern Lights')
    assert nl['sitemap']=='https://norlights.com/post-sitemap.xml'
    assert nl['sitemapStatus']=='ready'
    page.get_by_placeholder('搜索来源名称').fill('Northern Lights')
    page.get_by_role('link',name='站点地图：',exact=False).wait_for()
    assert page.get_by_role('button',name='同步',exact=True).count()==0
    page.screenshot(path='.data/rss-unified.png')
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+5')
    assert not errors,errors
    assert page.request.post('http://49.233.77.111/api/rss/sync',data={'sourceId':8}).status==404
    print('Missing-body filter/modal/validation and unified RSS inventory verified:',len(rss),'sources')
    browser.close()
