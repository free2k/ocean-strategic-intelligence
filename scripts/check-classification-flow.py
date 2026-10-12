from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Users/key/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
    context=browser.new_context(storage_state='.data/discovery-test-session.json',viewport={'width':1440,'height':1000})
    page=context.new_page(); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://49.233.77.111/articles',wait_until='networkidle')
    page.get_by_role('button',name='分类规则',exact=True).click()
    panel=page.get_by_role('region',name='历史分类与智库更新')
    panel.wait_for()
    panel.get_by_role('button',name='预览历史影响范围',exact=True).click()
    panel.get_by_role('button',name='确认重分类、补投递并更新图表',exact=True).wait_for(timeout=60000)
    assert '预计分类变化' in panel.inner_text()
    assert '保留人工分类' in panel.inner_text()
    state=page.request.get('http://49.233.77.111/api/filters/reprocess').json()
    assert isinstance(state['jobs'],list)
    denied=page.request.post('http://49.233.77.111/api/filters/reprocess',data={'version':'invalid-version-for-readonly-check'})
    assert denied.status==409
    assert len(page.request.get('http://49.233.77.111/api/filters/reprocess').json()['jobs'])==len(state['jobs'])
    page.screenshot(path='.data/classification-flow-preview.png')
    print(panel.inner_text()[:1000])
    assert not errors,errors
    browser.close()
    print('PASS: live preview, scope statistics, historical confirmation UI, stale-version rejection; no live reprocessing submitted')
