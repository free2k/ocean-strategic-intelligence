import json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Users/key/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
    context=browser.new_context(storage_state='.data/open-test-session.json',viewport={'width':1440,'height':1000})
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://49.233.77.111/ocean-intelligence/#sources',wait_until='networkidle',timeout=90000)
    page.locator('.source-funnel').first.wait_for(timeout=60000)
    card=page.locator('.source-cards > *').filter(has=page.get_by_role('heading',name='海洋知圈',exact=True))
    print(card.inner_text())
    for label in ['已采集','已纳入','候选','排除','待处理']:
        assert label in card.inner_text()
    card.screenshot(path='.data/mp-clean-source-card.png')
    page.set_viewport_size({'width':390,'height':844})
    assert card.locator('.source-funnel').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
    assert not errors,errors
    print('Desktop and mobile source funnel rendered without JS errors')
    browser.close()
