from playwright.sync_api import sync_playwright
import re
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Users/key/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
    context=browser.new_context(storage_state='.data/discovery-test-session.json',viewport={'width':1440,'height':1000})
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://49.233.77.111/wechat/subscriptions',wait_until='networkidle',timeout=90000)
    page.get_by_role('heading',name='公众号与 X 订阅',exact=True).wait_for()
    assert page.get_by_label('导入公众号TXT').count()==0
    assert '远端已订阅' not in page.inner_text('body')
    assert '取消远端订阅' not in page.inner_text('body')
    page.get_by_label('搜索账号名称').fill('海洋知圈')
    page.get_by_role('heading',name='海洋知圈',exact=True).wait_for()
    page.get_by_role('link',name='查看文章',exact=True).click()
    page.wait_for_url('**/subscription-articles?**')
    page.get_by_role('heading',name='海洋知圈',exact=True,level=1).wait_for()
    page.get_by_text('下列内容仅属于「海洋知圈」',exact=False).wait_for()
    assert page.locator('article').count()>0
    page.screenshot(path='.data/subscription-articles-layout.png')
    if page.get_by_role('button',name='下一页',exact=True).is_enabled():
        page.get_by_role('button',name='下一页',exact=True).click()
        page.wait_for_url('**page=2')
        page.reload(wait_until='networkidle')
        assert '第 2 /' in page.inner_text('body')
    page.get_by_role('link',name='← 返回订阅账号',exact=True).click()
    page.get_by_label('搜索账号名称').wait_for()
    assert page.get_by_label('搜索账号名称').input_value()=='海洋知圈'
    page.get_by_label('搜索账号名称').fill('')
    page.screenshot(path='.data/subscriptions-layout.png')
    page.get_by_role('navigation',name='订阅管理功能').get_by_role('button',name='添加订阅',exact=True).click()
    page.get_by_label('导入公众号TXT').wait_for()
    page.get_by_label('导入公众号TXT').set_input_files('docs/wechatPost.txt')
    page.get_by_text('共 36 行',exact=False).wait_for()
    assert '批量取消公众号远端订阅' not in page.inner_text('body')
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+5')
    page.get_by_role('navigation',name='订阅管理功能').get_by_role('button',name='同步记录',exact=True).click()
    page.get_by_role('heading',name='最近任务',exact=True).wait_for()
    assert not errors,errors
    print('Account search, article navigation/pagination/reload/return, import and mobile checks passed')
    browser.close()
