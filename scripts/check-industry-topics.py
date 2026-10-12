from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Users/key/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
    context=browser.new_context(storage_state='.data/discovery-test-session.json',viewport={'width':1600,'height':1000})
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    base='http://49.233.77.111'
    scope={'overseas':'false','filterStatus':'accepted'}
    topics=page.request.get(base+'/api/topics',params=scope).json()['topics']
    assert len(topics)==6,topics
    for t in topics:
        articles=page.request.get(base+'/api/articles',params={**scope,'matchedTopic':t['id']}).json()
        assert articles['total']==t['articleCount'],(t,articles['total'])
    old=page.request.get(base+'/api/articles',params={**scope,'matchedTopic':'海洋新能源'}).json()
    new=page.request.get(base+'/api/articles',params={**scope,'matchedTopic':'海上风电'}).json()
    assert old['total']==new['total']
    assert [a['id'] for a in old['articles']]==[a['id'] for a in new['articles']]
    empty=page.request.get(base+'/api/topics',params={**scope,'search':'no-such-title-topic-test'}).json()['topics']
    assert len(empty)==6 and all(t['articleCount']==0 for t in empty)
    page.goto(base+'/articles',wait_until='networkidle')
    dropdown=next(s for s in page.locator('select').all() if s.locator('option[value="accepted"]').count())
    dropdown.select_option('accepted')
    button=page.get_by_role('button',name='海洋新能源',exact=False)
    button.wait_for()
    button.click()
    page.wait_for_timeout(1500)
    page.screenshot(path='.data/six-standard-industries.png')
    assert not errors,errors
    print('PASS six fixed topics, filtered unique-article counts, historical aliases, zero counts and browser rendering')
    print([(t['name'],t['articleCount']) for t in topics])
    browser.close()
