from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Users/key/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
    context=browser.new_context(storage_state='.data/discovery-test-session.json',viewport={'width':1440,'height':1000})
    page=context.new_page(); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://49.233.77.111/wechat/subscriptions',wait_until='networkidle',timeout=90000)
    page.get_by_role('heading',name='AI 查找公众号文章链接').wait_for()
    page.get_by_label('导入公众号TXT').set_input_files('docs/wechatPost.txt')
    button=page.get_by_role('button',name='AI 查找并订阅核验项（22）')
    button.wait_for();assert button.is_enabled()
    assert page.get_by_role('button',name='仅查找与核验',exact=True).is_enabled()
    page.screenshot(path='.data/mp-discovery-ui.png',full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+5')
    assert not errors,errors
    print('Live AI discovery controls: 22 unmatched accounts; desktop/mobile and JS checks passed')
    browser.close()
