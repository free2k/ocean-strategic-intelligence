import time
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Users/key/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
    context=browser.new_context(storage_state='.data/discovery-test-session.json',viewport={'width':1440,'height':1100})
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    for search,expected in [('越南瞄准SAF','pending'),('能源装备提质升级','accepted')]:
        for attempt in range(45):
            result=page.request.get('http://49.233.77.111/api/articles',params={'search':search}).json()
            a=result['articles'][0]
            if a.get('classificationEvidence',{}).get('model'):break
            time.sleep(2)
        assert a['filterStatus']==expected,a
        assert a['classifyMethod']=='llm',a
        assert a['classificationEvidence']['model']=='qwen-plus',a
        if expected=='accepted':assert a['classificationEvidence']['quote'],a
        print('PASS persisted semantic decision',a['id'],a['filterStatus'])
    page.goto('http://49.233.77.111/articles',wait_until='networkidle')
    page.get_by_placeholder('搜索标题...').fill('能源装备提质升级')
    page.get_by_role('button',name='搜索',exact=True).click()
    page.get_by_text('判断模型：qwen-plus',exact=True).first.wait_for()
    assert page.get_by_text('原文证据：',exact=False).count()
    assert not errors,errors
    page.screenshot(path='.data/semantic-classification-live.png')
    browser.close()
    print('PASS model, reason and original evidence rendered without browser errors')
