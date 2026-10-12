from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Users/key/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
    context=browser.new_context(storage_state='.data/discovery-test-session.json',viewport={'width':1440,'height':1000})
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://49.233.77.111/wechat/subscription-articles?source=mp%3A3990115016',wait_until='networkidle')
    page.get_by_role('heading',name='中国海上油气',exact=True,level=1).wait_for()
    page.locator('article').first.locator('summary').click()
    page.get_by_text('采集分类方式：关键词规则（本项未调用大模型）',exact=True).first.wait_for()
    assert '正向关键词' in page.inner_text('body')
    assert '采集规则版本' in page.inner_text('body')
    page.locator('article').nth(2).locator('summary').click()
    assert '招聘' in page.locator('article').nth(2).inner_text()
    page.screenshot(path='.data/classification-evidence.png')
    page.goto('http://49.233.77.111/wechat/subscriptions',wait_until='networkidle')
    assert '公众号 / X 采集' in page.inner_text('body')
    assert '上次完成同步' in page.inner_text('body')
    status=page.request.get('http://49.233.77.111/api/subscriptions').json()
    assert status['queue']['pollSeconds']==60
    assert not errors,errors
    print('Live positive/negative keywords, classification method, rule version, queue API and scheduler labels passed')
    browser.close()
