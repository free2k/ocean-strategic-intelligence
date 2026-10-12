from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Users/key/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
    context=browser.new_context(storage_state='.data/discovery-test-session.json',viewport={'width':1440,'height':1000})
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://49.233.77.111/wechat/subscriptions',wait_until='networkidle')
    table=page.get_by_role('table',name='订阅源列表');table.wait_for()
    assert table.get_by_role('columnheader',name='已有正文',exact=True).count()==0
    assert table.get_by_role('columnheader',name='Mp2RSS 收录 / 正文',exact=True).count()==1
    assert table.get_by_role('columnheader',name='历史文章（非 Mp2RSS）',exact=True).count()==1
    response=page.request.get('http://49.233.77.111/api/subscriptions');assert response.status==200
    data=response.json()
    for account in data['list']:
        if not account['present'] or account['payload']['platform']!='mp':continue
        row=table.get_by_role('row').filter(has=page.get_by_role('link',name=account['payload']['name'],exact=True))
        cells=row.locator('td')
        assert cells.nth(1).inner_text()==str(account['legacy_count'])+' 篇'
        if account['count']>0 and account['count']==account['ready']:assert '正文齐全' in cells.nth(0).inner_text()
        if account['count']==0:assert '暂无文章' in cells.nth(0).inner_text()
    page.screenshot(path='.data/subscription-history.png',full_page=False)
    assert not errors,errors
    print('Merged body status and all account history counts verified:',data['history'])
    browser.close()
