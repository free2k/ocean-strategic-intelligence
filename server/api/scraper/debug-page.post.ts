import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

/**
 * 调试接口：打开页面并返回可交互元素的详细结构
 * 用于帮助用户确认正确的选择器
 */
export default defineEventHandler(async (event) => {
  const { url } = await readBody(event);
  if (!url) throw createError({ statusCode: 400, message: '缺少 URL' });

  const chromePath = findChromePath();
  if (!chromePath) throw createError({ statusCode: 500, message: '未找到 Chrome' });

  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: chromePath });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 提取详细的页面结构
    const structure = await page.evaluate(() => {
      function getFullSelector(el: Element): string {
        const parts: string[] = [];
        let current: Element | null = el;
        while (current && current !== document.body) {
          let selector = current.tagName.toLowerCase();
          if (current.id) {
            selector = `#${current.id}`;
            parts.unshift(selector);
            break;
          }
          if (current.className && typeof current.className === 'string') {
            const classes = current.className.trim().split(/\s+/).slice(0, 2).join('.');
            if (classes) selector += `.${classes}`;
          }
          const parent = current.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(c => c.tagName === current!.tagName);
            if (siblings.length > 1) {
              const idx = siblings.indexOf(current) + 1;
              selector += `:nth-child(${idx})`;
            }
          }
          parts.unshift(selector);
          current = current.parentElement;
        }
        return parts.join(' > ');
      }

      // 找到所有可点击的、有文本的元素
      const clickables: { text: string; selector: string; tag: string; visible: boolean }[] = [];
      const elements = document.querySelectorAll('a, button, li, span[onclick], div[onclick], [role="button"], [role="tab"], [role="treeitem"]');
      
      elements.forEach(el => {
        const text = (el as HTMLElement).innerText?.trim().slice(0, 60);
        if (!text || text.includes('\n')) return; // 跳过多行文本（容器）
        const rect = el.getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0;
        clickables.push({
          text,
          selector: getFullSelector(el),
          tag: el.tagName.toLowerCase(),
          visible,
        });
      });

      // 找到所有 select/下拉框
      const selects: { text: string; selector: string; options: string[] }[] = [];
      document.querySelectorAll('select').forEach(sel => {
        const options = Array.from(sel.options).map(o => o.text.trim());
        selects.push({
          text: sel.previousElementSibling?.textContent?.trim() || '',
          selector: getFullSelector(sel),
          options,
        });
      });

      return { clickables: clickables.slice(0, 100), selects };
    });

    await browser.close();
    return structure;
  } catch (error: any) {
    if (browser) await browser.close();
    throw createError({ statusCode: 500, message: error.message });
  }
});

function findChromePath(): string | undefined {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ];
  for (const p of paths) {
    if (p && existsSync(p)) return p;
  }
  return undefined;
}
