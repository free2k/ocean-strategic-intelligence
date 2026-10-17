from playwright.sync_api import sync_playwright
from pathlib import Path
with sync_playwright() as p:
    context=p.chromium.launch_persistent_context(str(Path('.data/mp2rss-console-profile').resolve()),headless=False,executable_path='C:/Users/key/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',args=['--remote-debugging-port=9223','--remote-debugging-address=127.0.0.1'],no_viewport=True)
    page=context.pages[0] if context.pages else context.new_page()
    try:
        page.goto('https://mp2rss.bugcode.dev/',wait_until='domcontentloaded')
    except Exception:
        print('Navigation failed; browser retained for retry',flush=True)
    while context.pages:
        context.pages[0].wait_for_timeout(1000)
