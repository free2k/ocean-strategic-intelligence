from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Users/key/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
    context=browser.new_context(storage_state='.data/discovery-test-session.json',viewport={'width':1500,'height':1000})
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://49.233.77.111/wechat/subscriptions?view=activity',wait_until='networkidle')
    page.get_by_role('heading',name='最近任务',exact=True).wait_for()
    assert '失败' not in page.inner_text('body')
    details=page.locator('details').filter(has_text='International Energy Agency').first
    details.locator('summary').click()
    assert '失败' in details.inner_text()
    assert '更新' in details.inner_text() and '内容未变' in details.inner_text()
    page.screenshot(path='.data/sync-records-details.png')
    assert not errors,errors
    browser.close()
    print('PASS collapsed tasks hide errors, expanded details retain status and count explanations')
