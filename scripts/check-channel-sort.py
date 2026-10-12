from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Users/key/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
    context=browser.new_context(storage_state='.data/discovery-test-session.json',viewport={'width':1440,'height':1000})
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://49.233.77.111/wechat/subscriptions',wait_until='networkidle')
    group=page.get_by_role('group',name='渠道类型');group.wait_for()
    assert group.get_by_role('button',name='微信公众号',exact=False).get_attribute('aria-pressed')=='true'
    data=page.request.get('http://49.233.77.111/api/subscriptions').json()
    for platform,label in [('mp','微信公众号'),('x','X 渠道')]:
        group.get_by_role('button',name=label,exact=False).click()
        page.wait_for_function('(v)=>document.querySelector("[aria-label=渠道类型]").innerText.includes(v)',arg=label)
        page.wait_for_timeout(300)
        expected=[s for s in data['list'] if s['present'] and s['payload']['platform']==platform]
        names=page.locator('table[aria-label="订阅源列表"] tbody th[scope="row"] a').all_text_contents()
        assert set(names)=={s['payload']['name'] for s in expected},(platform,names)
        records={s['payload']['name']:s for s in expected}
        keys=[(2 if int(records[n]['ready'])>0 else 1 if int(records[n]['count'])>0 else 0,records[n]['latest'] or '') for n in names]
        assert keys==sorted(keys,reverse=True),keys
    page.reload(wait_until='networkidle')
    assert group.get_by_role('button',name='X 渠道',exact=False).get_attribute('aria-pressed')=='true'
    page.get_by_role('link',name='查看文章',exact=True).first.click()
    page.get_by_role('link',name='← 返回订阅账号',exact=True).wait_for()
    page.get_by_role('link',name='← 返回订阅账号',exact=True).click()
    group.wait_for()
    assert group.get_by_role('button',name='X 渠道',exact=False).get_attribute('aria-pressed')=='true'
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+5')
    assert not errors,errors
    print('Channel separation, content/date ordering, reload/return and mobile passed')
    browser.close()
