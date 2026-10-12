from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Users/key/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
    context=browser.new_context(storage_state='.data/batch-test-session.json',viewport={'width':1440,'height':1000})
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://49.233.77.111/wechat/subscriptions',wait_until='networkidle',timeout=90000)
    page.get_by_role('heading',name='批量导入与订阅管理').wait_for()
    assert page.get_by_label('启用采集',exact=True).count()==0
    assert page.get_by_label('文章',exact=True).count()==0
    page.get_by_label('导入公众号TXT').set_input_files('docs/wechatPost.txt')
    page.get_by_text('共 36 行',exact=False).wait_for()
    assert '已订阅 14' in page.inner_text('body')
    assert '待补链接 22' in page.inner_text('body')
    assert page.get_by_role('button',name='提交 0 个新增订阅').is_disabled()
    page.get_by_text('批量管理现有订阅',exact=True).click()
    page.get_by_role('button',name='全选公众号',exact=True).click()
    assert page.get_by_role('button',name='批量取消公众号远端订阅',exact=True).is_enabled()
    page.screenshot(path='.data/mp-batch-ui.png')
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+5')
    assert not errors,errors
    print('Live TXT preview: 36 rows, 14 existing, 22 require links; controls and mobile layout passed')
    browser.close()
