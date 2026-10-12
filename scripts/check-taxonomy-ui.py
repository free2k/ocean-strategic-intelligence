import json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Users/key/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
    context=browser.new_context(storage_state='.data/discovery-test-session.json',viewport={'width':1500,'height':1000})
    context.add_cookies([json.load(open('.data/taxonomy-test-session.json',encoding='utf-8'))])
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    base='http://49.233.77.111'
    rules=page.request.get(base+'/api/filters').json()
    assert len(rules['definitions'])==6 and rules['taxonomyVersion']=='marine-six-v1'
    assert all(t['definition'] and t['boundary'] for t in rules['definitions'])
    data=page.request.get(base+'/ocean-intelligence/api/data').json()
    assert rules['definitions']==data['topicDefinitions']
    assert rules['taxonomyVersion']==data['taxonomyVersion']
    invalid=page.request.post(base+'/api/filters',data={'type':'include','topic':'invalid-taxonomy-test','titleKeywords':['test']})
    assert invalid.status==400
    page.goto(base+'/articles',wait_until='networkidle')
    page.get_by_role('button',name='分类规则',exact=True).click()
    page.locator('[aria-label="统一六大领域定义"]').wait_for()
    assert page.locator('[aria-label="统一六大领域定义"] details').count()==7
    page.screenshot(path='.data/shared-taxonomy-rules.png')
    page.goto(base+'/ocean-intelligence/#dashboard',wait_until='networkidle')
    page.locator('#topic option[value="海上风电"]').wait_for(state='attached')
    assert page.locator('#topic option[value="海上风电"]').inner_text()=='海洋新能源'
    assert page.locator('#topic option').count()==7
    page.screenshot(path='.data/shared-taxonomy-intelligence.png')
    assert not errors,errors
    browser.close()
    print('PASS identical definitions/version across rule management and intelligence, six dropdown domains, invalid domain rejected, no browser errors')
