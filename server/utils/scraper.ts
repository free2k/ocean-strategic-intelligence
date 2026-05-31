import { chromium, type Browser, type Page, type BrowserContext } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ScraperStep, ScraperAuthConfig } from '../db/schema';

export interface ScrapeResult {
  success: boolean;
  data: Record<string, any>[];
  columns: string[];
  error?: string;
}

/**
 * 执行 Playwright 抓取任务
 * 从指定 URL 按选择器提取表格数据
 */
export async function executeScrape(options: {
  url: string;
  tableSelector: string;
  steps?: ScraperStep[];
  authConfig?: ScraperAuthConfig | null;
  executablePath?: string;
}): Promise<ScrapeResult> {
  let browser: Browser | null = null;

  try {
    // 启动浏览器（使用系统安装的 Chrome/Chromium）
    browser = await chromium.launch({
      headless: true,
      executablePath: options.executablePath || findChromePath(),
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    // 注入 cookies（如果配置了）
    if (options.authConfig?.type === 'cookie' && options.authConfig.cookieFile) {
      await injectCookies(context, options.authConfig.cookieFile);
    }

    const page = await context.newPage();

    // 导航到目标页面
    await page.goto(options.url, { waitUntil: 'networkidle', timeout: 60000 });

    // 等待页面基本渲染完成
    await page.waitForTimeout(2000);

    // 执行预定义步骤（点击 tab、等待元素等）
    if (options.steps?.length) {
      await executeSteps(page, options.steps);
    }

    // 等待表格出现（使用 attached 状态，增加超时）
    try {
      await page.waitForSelector(options.tableSelector, { state: 'attached', timeout: 30000 });
      console.log(`[Scraper] 找到表格选择器: ${options.tableSelector}`);
    } catch {
      console.log(`[Scraper] 未找到指定选择器 "${options.tableSelector}"，将尝试自动检测`);
    }
    // 额外等待确保数据渲染完成
    await page.waitForTimeout(2000);

    // 提取表格数据
    console.log(`[Scraper] 开始提取表格数据...`);
    const result = await extractTableData(page, options.tableSelector);
    console.log(`[Scraper] 提取结果: success=${result.success}, rows=${result.data.length}, columns=${result.columns.join(',')}`);
    if (!result.success) {
      console.log(`[Scraper] 提取失败原因: ${result.error}`);
    }

    await browser.close();
    return result;
  } catch (error: any) {
    if (browser) await browser.close();
    return {
      success: false,
      data: [],
      columns: [],
      error: error.message || '抓取失败',
    };
  }
}


/**
 * 执行 Playwright 操作步骤序列
 */
async function executeSteps(page: Page, steps: ScraperStep[]): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const timeout = step.timeout || 15000;
    const stepNum = i + 1;

    console.log(`[Scraper] 步骤 ${stepNum}/${steps.length}: ${step.action} ${step.selector || ''} ${step.value || ''}`);

    try {
      switch (step.action) {
        case 'click':
          if (step.selector) {
            await smartClick(page, step.selector, timeout);
            await page.waitForTimeout(1500);
          }
          break;
        case 'waitForSelector':
          if (step.selector) {
            await page.waitForSelector(step.selector, { state: 'attached', timeout });
          }
          break;
        case 'wait':
          await page.waitForTimeout(step.timeout || 1000);
          break;
        case 'type':
          if (step.selector && step.value) {
            await page.waitForSelector(step.selector, { state: 'attached', timeout });
            await page.fill(step.selector, step.value);
          }
          break;
        case 'select':
          if (step.selector && step.value) {
            await smartSelect(page, step.selector, step.value, timeout);
            await page.waitForTimeout(1000);
          }
          break;
        case 'goto':
          if (step.value) {
            await page.goto(step.value, { waitUntil: 'networkidle', timeout });
          }
          break;
      }
      console.log(`[Scraper] 步骤 ${stepNum} ✓ 完成`);
    } catch (err: any) {
      console.error(`[Scraper] 步骤 ${stepNum} ✗ 失败: ${err.message}`);
      throw err;
    }
  }
}

/**
 * 智能点击：根据选择器格式选择最佳匹配策略
 */
async function smartClick(page: Page, selector: string, timeout: number): Promise<void> {
  let textToFind = '';

  // 解析文本选择器
  if (selector.startsWith('text=')) {
    textToFind = selector.slice(5);
  } else if (selector.includes(':has-text(')) {
    const match = selector.match(/:has-text\(["'](.+?)["']\)/);
    if (match) textToFind = match[1];
  }

  if (textToFind) {
    console.log(`[Scraper]   文本匹配: "${textToFind}"`);

    // 使用 locator 配合 filter 找到可见的精确匹配元素
    const locator = page.getByText(textToFind, { exact: true });
    const count = await locator.count();
    console.log(`[Scraper]   精确匹配到 ${count} 个元素`);

    if (count === 0) {
      // 精确匹配失败，尝试模糊匹配
      const fuzzyLocator = page.getByText(textToFind);
      const fuzzyCount = await fuzzyLocator.count();
      console.log(`[Scraper]   模糊匹配到 ${fuzzyCount} 个元素`);
      if (fuzzyCount > 0) {
        // 用 force: true 强制点击（跳过可见性检查）
        await fuzzyLocator.first().click({ timeout, force: true });
        return;
      }
      throw new Error(`未找到包含文本"${textToFind}"的元素`);
    }

    // 尝试找到可见的元素点击
    for (let i = 0; i < count; i++) {
      const el = locator.nth(i);
      const isVisible = await el.isVisible();
      if (isVisible) {
        console.log(`[Scraper]   点击第 ${i + 1} 个可见元素`);
        await el.click({ timeout });
        return;
      }
    }

    // 所有元素都不可见，用 dispatchEvent 直接触发
    console.log(`[Scraper]   所有元素不可见，用 JS dispatchEvent 触发点击`);
    await locator.first().dispatchEvent('click');
  } else {
    // 普通 CSS 选择器
    console.log(`[Scraper]   CSS选择器: "${selector}"`);
    try {
      await page.waitForSelector(selector, { state: 'attached', timeout: 5000 });
    } catch {
      await page.waitForTimeout(1000);
    }
    await page.click(selector, { timeout });
  }
}

/**
 * 智能选择：兼容原生 select 和自定义下拉框
 */
async function smartSelect(page: Page, selector: string, value: string, timeout: number): Promise<void> {
  console.log(`[Scraper]   选择操作: 触发器="${selector}", 值="${value}"`);

  // 先尝试原生 select
  try {
    const el = await page.waitForSelector(selector, { state: 'attached', timeout: 3000 });
    if (el) {
      const tagName = await el.evaluate(node => node.tagName.toLowerCase());
      if (tagName === 'select') {
        console.log(`[Scraper]   原生 select，直接选择`);
        await page.selectOption(selector, value);
        return;
      }
    }
  } catch {
    // 不是原生 select 或找不到
  }

  // 自定义下拉框：先点击触发器打开下拉
  console.log(`[Scraper]   自定义下拉框，先点击触发器`);
  await smartClick(page, selector, timeout);
  await page.waitForTimeout(1500); // 等待下拉菜单动画展开

  // 然后点击选项文本（等待选项变为可见）
  console.log(`[Scraper]   等待选项"${value}"可见并点击`);
  const optionLocator = page.getByText(value, { exact: true });

  // 等待选项出现并可见
  try {
    await optionLocator.first().waitFor({ state: 'visible', timeout: 5000 });
    await optionLocator.first().click({ timeout });
  } catch {
    // 如果等不到可见，尝试用 JavaScript 直接触发点击
    console.log(`[Scraper]   选项不可见，尝试 JS 直接点击`);
    const count = await optionLocator.count();
    if (count > 0) {
      await optionLocator.first().dispatchEvent('click');
    } else {
      // 最后尝试：用 evaluate 在页面中查找并点击
      const clicked = await page.evaluate((text) => {
        const elements = document.querySelectorAll('span, li, a, div, option');
        for (const el of elements) {
          if ((el as HTMLElement).innerText?.trim() === text) {
            (el as HTMLElement).click();
            return true;
          }
        }
        return false;
      }, value);
      if (!clicked) {
        throw new Error(`无法点击选项"${value}"，元素不可见且 JS 点击失败`);
      }
      console.log(`[Scraper]   通过 JS evaluate 点击成功`);
    }
  }
}

/**
 * 从页面提取表格数据
 * 支持标准 <table> 和 div 模拟的表格
 */
async function extractTableData(page: Page, selector: string): Promise<ScrapeResult> {
  // 先检查元素是否存在
  const elementInfo = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false, tag: '', childCount: 0 };
    return {
      found: true,
      tag: el.tagName.toLowerCase(),
      childCount: el.children.length,
      html: el.outerHTML.slice(0, 500),
    };
  }, selector);

  console.log(`[Scraper] 表格元素检测: found=${elementInfo.found}, tag=${elementInfo.tag}, children=${elementInfo.childCount}`);

  if (!elementInfo.found) {
    // 如果指定选择器找不到，尝试自动检测页面上的表格类结构
    console.log(`[Scraper] 指定选择器未找到，尝试自动检测表格...`);
    return await autoExtractTable(page);
  }

  if (elementInfo.tag === 'table') {
    return await extractStandardTable(page, selector);
  } else {
    // 非标准 table，尝试按 div 表格提取
    return await extractDivTable(page, selector);
  }
}

/**
 * 提取标准 <table> 元素的数据
 */
async function extractStandardTable(page: Page, selector: string): Promise<ScrapeResult> {
  const result = await page.evaluate((sel) => {
    const table = document.querySelector(sel);
    if (!table) return { success: false, data: [], columns: [], error: '未找到表格元素' };

    const headers: string[] = [];
    const headerCells = table.querySelectorAll('thead th, thead td, tr:first-child th, tr:first-child td');
    headerCells.forEach((cell) => {
      headers.push((cell as HTMLElement).innerText.trim());
    });

    const rows = table.querySelectorAll('tbody tr, tr');
    if (headers.length === 0 && rows.length > 0) {
      rows[0].querySelectorAll('th, td').forEach((cell) => {
        headers.push((cell as HTMLElement).innerText.trim());
      });
    }

    const data: Record<string, any>[] = [];
    const dataRows = table.querySelector('tbody')
      ? table.querySelectorAll('tbody tr')
      : Array.from(rows).slice(headers.length > 0 ? 1 : 0);

    dataRows.forEach((row) => {
      const cells = row.querySelectorAll('td, th');
      if (cells.length === 0) return;
      const rowData: Record<string, any> = {};
      cells.forEach((cell, idx) => {
        const key = headers[idx] || `col_${idx}`;
        const value = (cell as HTMLElement).innerText.trim();
        const num = Number(value.replace(/,/g, ''));
        rowData[key] = isNaN(num) || value === '' ? value : num;
      });
      data.push(rowData);
    });

    return { success: true, data, columns: headers, error: undefined };
  }, selector);

  return result as ScrapeResult;
}

/**
 * 提取 div 模拟表格的数据
 */
async function extractDivTable(page: Page, selector: string): Promise<ScrapeResult> {
  const result = await page.evaluate((sel) => {
    const container = document.querySelector(sel);
    if (!container) return { success: false, data: [], columns: [], error: '未找到容器' };

    // 策略：找到所有行级元素（通常是相同 class 的 div）
    const allRows = container.querySelectorAll('[class*="row"], [class*="tr"], [class*="line"], [class*="item"]');
    if (allRows.length < 2) {
      // 尝试直接用子元素
      return { success: false, data: [], columns: [], error: 'div表格结构无法识别' };
    }

    // 第一行当表头
    const headers: string[] = [];
    allRows[0].querySelectorAll('[class*="col"], [class*="td"], [class*="cell"], span, div').forEach(cell => {
      const text = (cell as HTMLElement).innerText?.trim();
      if (text && !headers.includes(text)) headers.push(text);
    });

    const data: Record<string, any>[] = [];
    for (let i = 1; i < allRows.length; i++) {
      const cells = allRows[i].querySelectorAll('[class*="col"], [class*="td"], [class*="cell"], span, div');
      const rowData: Record<string, any> = {};
      let cellIdx = 0;
      cells.forEach(cell => {
        const text = (cell as HTMLElement).innerText?.trim();
        if (text !== undefined && text !== '') {
          const key = headers[cellIdx] || `col_${cellIdx}`;
          const num = Number(text.replace(/,/g, ''));
          rowData[key] = isNaN(num) || text === '' ? text : num;
          cellIdx++;
        }
      });
      if (Object.keys(rowData).length > 0) data.push(rowData);
    }

    return { success: data.length > 0, data, columns: headers, error: data.length === 0 ? 'div表格未提取到数据' : undefined };
  }, selector);

  return result as ScrapeResult;
}

/**
 * 自动检测并提取页面上的表格数据
 * 当指定选择器找不到时的兜底方案
 */
async function autoExtractTable(page: Page): Promise<ScrapeResult> {
  const result = await page.evaluate(() => {
    // 策略1: 找标准 table
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      const rows = table.querySelectorAll('tr');
      if (rows.length >= 2) {
        const headers: string[] = [];
        rows[0].querySelectorAll('th, td').forEach(cell => {
          headers.push((cell as HTMLElement).innerText.trim());
        });

        const data: Record<string, any>[] = [];
        for (let i = 1; i < rows.length; i++) {
          const cells = rows[i].querySelectorAll('td, th');
          if (cells.length === 0) continue;
          const rowData: Record<string, any> = {};
          cells.forEach((cell, idx) => {
            const key = headers[idx] || `col_${idx}`;
            const value = (cell as HTMLElement).innerText.trim();
            const num = Number(value.replace(/,/g, ''));
            rowData[key] = isNaN(num) || value === '' ? value : num;
          });
          data.push(rowData);
        }
        if (data.length > 0) {
          return { success: true, data, columns: headers, error: undefined };
        }
      }
    }

    // 策略2: 找 class 中包含 table 的 div 容器
    const divTables = document.querySelectorAll('[class*="table"], [class*="grid"], [class*="datagrid"]');
    for (const container of divTables) {
      const text = (container as HTMLElement).innerText || '';
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 3) continue;

      // 尝试按 tab 分隔解析
      const headers = lines[0].split('\t').map(h => h.trim()).filter(Boolean);
      if (headers.length < 2) continue;

      const data: Record<string, any>[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split('\t').map(c => c.trim());
        if (cells.length < 2) continue;
        const rowData: Record<string, any> = {};
        cells.forEach((cell, idx) => {
          const key = headers[idx] || `col_${idx}`;
          const num = Number(cell.replace(/,/g, ''));
          rowData[key] = isNaN(num) || cell === '' ? cell : num;
        });
        data.push(rowData);
      }
      if (data.length > 0) {
        return { success: true, data, columns: headers, error: undefined };
      }
    }

    // 策略3: 最后兜底 - 获取页面上所有可见的表格状文本
    // 找到最大的包含多行多列文本的区域
    const allElements = document.querySelectorAll('div, section');
    let bestData: Record<string, any>[] = [];
    let bestColumns: string[] = [];

    for (const el of allElements) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 300 || rect.height < 100) continue;

      const innerText = (el as HTMLElement).innerText || '';
      const lines = innerText.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 3) continue;

      // 检查是否有规律的列结构（每行的 tab/多空格 分隔数相近）
      const firstLineCols = lines[0].split(/\t|\s{2,}/).filter(Boolean);
      if (firstLineCols.length < 2) continue;

      const headers = firstLineCols;
      const data: Record<string, any>[] = [];
      for (let i = 1; i < Math.min(lines.length, 50); i++) {
        const cells = lines[i].split(/\t|\s{2,}/).filter(Boolean);
        if (cells.length < 2) continue;
        const rowData: Record<string, any> = {};
        cells.forEach((cell, idx) => {
          const key = headers[idx] || `col_${idx}`;
          const num = Number(cell.replace(/,/g, ''));
          rowData[key] = isNaN(num) || cell === '' ? cell : num;
        });
        data.push(rowData);
      }

      if (data.length > bestData.length) {
        bestData = data;
        bestColumns = headers;
      }
    }

    if (bestData.length > 0) {
      return { success: true, data: bestData, columns: bestColumns, error: undefined };
    }

    return { success: false, data: [], columns: [], error: '页面上未检测到表格数据' };
  });

  return result as ScrapeResult;
}

/**
 * 注入 cookies 到浏览器上下文
 */
async function injectCookies(context: BrowserContext, cookieFile: string): Promise<void> {
  try {
    const filePath = resolve(process.cwd(), cookieFile);
    const content = readFileSync(filePath, 'utf-8');
    const cookies = JSON.parse(content);
    if (Array.isArray(cookies)) {
      await context.addCookies(cookies);
    }
  } catch {
    // Cookie 注入失败不阻断流程
  }
}

/**
 * 查找系统 Chrome 路径
 */
function findChromePath(): string | undefined {
  const paths = [
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];

  for (const p of paths) {
    if (p && existsSync(p)) return p;
  }
  return undefined;
}
