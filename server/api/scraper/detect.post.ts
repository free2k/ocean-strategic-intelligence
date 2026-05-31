import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

/**
 * 自动检测目标页面中的所有表格
 * 返回每个表格的选择器、行数和预览文本
 */
export default defineEventHandler(async (event) => {
  const { url } = await readBody(event);
  if (!url) throw createError({ statusCode: 400, message: '缺少 URL' });

  const chromePath = findChromePath();
  if (!chromePath) {
    throw createError({
      statusCode: 500,
      message: '未找到 Chrome 浏览器，请确保系统已安装 Google Chrome',
    });
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: chromePath,
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // 检测页面中所有表格
    const tables = await page.evaluate(() => {
      const results: { selector: string; preview: string; rows: number }[] = [];
      const allTables = document.querySelectorAll('table');

      allTables.forEach((table, index) => {
        const rows = table.querySelectorAll('tr');
        if (rows.length < 2) return; // 跳过空表格

        // 生成唯一选择器
        let selector = '';
        if (table.id) {
          selector = `#${table.id}`;
        } else if (table.className) {
          const cls = table.className.split(' ').filter(Boolean)[0];
          if (cls) selector = `table.${cls}`;
        }
        if (!selector) {
          selector = allTables.length === 1 ? 'table' : `table:nth-of-type(${index + 1})`;
        }

        // 提取预览（前几个单元格的文本）
        const cells: string[] = [];
        const firstRow = rows[0] || rows[1];
        if (firstRow) {
          firstRow.querySelectorAll('th, td').forEach((cell) => {
            const text = (cell as HTMLElement).innerText.trim();
            if (text) cells.push(text);
          });
        }

        results.push({
          selector,
          preview: cells.slice(0, 5).join(' | ') || '(无法预览)',
          rows: rows.length - 1, // 减去表头
        });
      });

      return results;
    });

    await browser.close();
    return { tables };
  } catch (error: any) {
    if (browser) await browser.close();
    throw createError({
      statusCode: 500,
      message: `页面检测失败: ${error.message}`,
    });
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
    '/usr/bin/chromium',
  ];

  for (const p of paths) {
    if (p && existsSync(p)) return p;
  }
  return undefined;
}
