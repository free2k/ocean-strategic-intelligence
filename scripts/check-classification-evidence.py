from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Users/key/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
    context=browser.new_context(storage_state='.data/discovery-test-session.json',viewport={'width':1440,'height':1000})
    page=context.new_page(); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    for search,term in [('核心机场连遭打击','原油'),('三峡领航号','漂浮式风电')]:
        result=page.request.get('http://49.233.77.111/api/articles',params={'search':search}).json()
        a=result['articles'][0]
        assert any(h['keyword']==term for h in a['classificationEvidence']['keywords']),a
        assert a['classificationEvidence']['version']
    page.goto('http://49.233.77.111/articles',wait_until='networkidle')
    page.wait_for_selector('[aria-label="分类依据"]')
    assert all(x.inner_text().strip() for x in page.locator('[aria-label="分类依据"]').all())
    page.screenshot(path='.data/unified-classification-evidence.png')
    assert not errors,errors
    browser.close()
    print('PASS: both reported articles return saved keywords and rule versions; evidence cards render without browser errors')
