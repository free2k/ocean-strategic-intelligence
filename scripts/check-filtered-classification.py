from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Users/key/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
    context=browser.new_context(storage_state='.data/discovery-test-session.json',viewport={'width':1440,'height':1000})
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://49.233.77.111/articles',wait_until='networkidle')
    def select(value):
        next(s for s in page.locator('select').all() if s.locator('option[value="'+value+'"]').count()).select_option(value)
    select('mp2rss_mp');select('rejected')
    expected=page.request.get('http://49.233.77.111/api/articles',params={'sourceType':'mp2rss_mp','filterStatus':'rejected','overseas':'false'}).json()['total']
    with page.expect_response(lambda r:'/api/filters/reprocess?' in r.url and 'preview=1' in r.url,timeout=120000) as response:
        page.get_by_role('button',name='按当前筛选重新分类',exact=True).click()
    result=response.value.json()['preview']
    assert result['total']==expected,(result['total'],expected)
    assert result['scope']['filterStatus']=='rejected'
    assert result['scope']['sourceType']=='mp2rss_mp'
    assert result['scope']['overseas']=='false'
    assert result['scope']['targeted'] is True
    assert result['intelligence'] is None
    panel=page.get_by_role('region',name='历史分类与智库更新')
    panel.get_by_role('button',name='确认重分类、补投递并更新图表',exact=True).wait_for()
    assert '跨分页' in panel.inner_text()
    assert 'Mp2RSS 公众号' in panel.inner_text()
    page.screenshot(path='.data/filtered-classification-preview.png')
    # Closing and reopening recomputes from the newly selected status, not stale props.
    page.get_by_role('button',name='关闭',exact=True).click();select('accepted')
    with page.expect_response(lambda r:'/api/filters/reprocess?' in r.url and 'preview=1' in r.url,timeout=120000) as response:
        page.get_by_role('button',name='按当前筛选重新分类',exact=True).click()
    assert response.value.json()['preview']['scope']['filterStatus']=='accepted'
    assert not errors,errors
    print('PASS: live filtered preview matches list count ('+str(expected)+'), channel/status/domestic filters and modal reopening; no job submitted')
    browser.close()
