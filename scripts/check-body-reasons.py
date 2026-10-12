from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Users/key/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
    context=browser.new_context(storage_state='.data/discovery-test-session.json',viewport={'width':1440,'height':1000})
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://49.233.77.111/wechat/subscriptions',wait_until='networkidle')
    page.get_by_role('table',name='订阅源列表').wait_for()
    data=page.request.get('http://49.233.77.111/api/subscriptions').json()
    for s in data['list']:
        assert sum(r['count'] for r in s['body_reasons'])==s['count']-s['ready']
    source=next(s for s in data['list'] if s['payload']['name']=='中国船舶工业行业协会')
    row=page.get_by_role('row').filter(has=page.get_by_role('link',name=source['payload']['name'],exact=True))
    assert '图片正文待识别' in row.inner_text()
    row.get_by_role('link',name='篇待补正文',exact=False).click()
    page.locator('[data-body-reason]').first.wait_for()
    assert '尚未进行 OCR' in page.locator('[data-body-reason]').first.inner_text()
    result=page.request.get('http://49.233.77.111/api/subscriptions/items',params={'source':source['id'],'body':'missing'}).json()
    assert all(i['body_reason']['code']=='image_only' for i in result['items'])
    assert all('body_diagnostic' not in i for i in result['items'])
    page.screenshot(path='.data/body-reasons.png')
    source=next(s for s in data['list'] if any(r['code']=='provider_empty' for r in s['body_reasons']))
    result=page.request.get('http://49.233.77.111/api/subscriptions/items',params={'source':source['id'],'body':'missing'}).json()
    assert any(i['body_reason']['code']=='provider_empty' for i in result['items'])
    assert not errors,errors
    print('Live reason totals, image/provider labels and article explanation verified')
    browser.close()
