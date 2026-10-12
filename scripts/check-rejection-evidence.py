from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='C:/Users/key/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe')
    context=browser.new_context(storage_state='.data/discovery-test-session.json',viewport={'width':1440,'height':1000})
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://49.233.77.111/articles',wait_until='networkidle')
    dropdown=next(s for s in page.locator('select').all() if s.locator('option[value="rejected"]').count())
    dropdown.select_option('rejected')
    page.wait_for_function('()=>document.querySelectorAll("[aria-label=排除依据]").length===20')
    result=page.request.get('http://49.233.77.111/api/articles',params={'filterStatus':'rejected','overseas':'false','pageSize':20}).json()
    assert len(result['articles'])==20
    assert all(a['rejectionEvidence']['reason'] for a in result['articles'])
    assert all('排除原因' in s.inner_text() for s in page.locator('[aria-label="排除依据"]').all())
    page.screenshot(path='.data/article-rejection-evidence.png')
    assert not errors,errors
    print('PASS: excluded article cards show saved reasons; API returns evidence for all 20 rows; no browser errors')
    browser.close()
