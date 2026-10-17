import json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Users/key/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
    context=browser.new_context(storage_state='.data/discovery-test-session.json',viewport={'width':1500,'height':1000})
    context.add_cookies([json.load(open('.data/taxonomy-test-session.json',encoding='utf-8'))])
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    base='http://49.233.77.111'
    response=page.request.get(base+'/api/subscriptions')
    assert response.ok
    data=response.json();active=[s for s in data['list'] if s['present']]
    second=[s for s in active if 2 in s['payload'].get('accountLabels',[])]
    assert len(active)==100 and len(second)==50
    assert all(s['posts'] for s in second)
    assert 'mp2rss.bugcode.dev/feed/' not in response.text()
    page.goto(base+'/ocean-intelligence/#sources',wait_until='networkidle',timeout=90000)
    page.get_by_label('搜索渠道',exact=True).fill('WindEuropeEvent')
    page.get_by_text('@WindEuropeEvent',exact=True).wait_for()
    assert page.locator('#channel-table tbody tr').count()==1
    page.screenshot(path='.data/multi-account-channel.png')
    assert not errors,errors
    print('PASS 100 unique subscriptions, 50 added X channels with posts enabled, username search and no credentials exposed')
    browser.close()
