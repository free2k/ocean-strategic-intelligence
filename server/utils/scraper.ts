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
  // === 直接下载模式 ===
  // 触发条件：
  // 1. URL 直接指向文件（.xlsx/.xls/.csv 结尾）
  // 2. 只有一个 download 步骤（无需浏览器操作，直接 HTTP 下载 URL）
  // 3. 没有任何步骤且 URL 不像是网页（不含 html/page 等关键词）
  const isDirectFileUrl = /\.(xlsx|xls|csv)(\?|$)/i.test(options.url);
  const onlyDownloadStep = options.steps?.length === 1 && options.steps[0].action === 'download';
  const noSteps = !options.steps || options.steps.length === 0;

  if (isDirectFileUrl || onlyDownloadStep) {
    const sheetName = options.steps?.find(s => s.action === 'download')?.value;
    return await directDownloadFile(options.url, sheetName);
  }

  let browser: Browser | null = null;

  try {
    // 启动浏览器（使用系统安装的 Chrome/Chromium）
    const proxyServer = process.env.DOWNLOAD_PROXY || '';
    const useRealBrowser = process.env.SCRAPER_HEADED === 'true';

    browser = await chromium.launch({
      headless: !useRealBrowser,
      executablePath: options.executablePath || findChromePath(),
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--no-sandbox',
        '--disable-web-security',
        '--disable-setuid-sandbox',
      ],
      ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      acceptDownloads: true,
      locale: 'zh-CN',
      viewport: { width: 1920, height: 1080 },
      javaScriptEnabled: true,
    });

    // 反检测：在页面加载前注入脚本
    await context.addInitScript(() => {
      // 隐藏 webdriver 标记
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      // 模拟 chrome 对象
      // @ts-ignore
      window.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };
      // 模拟 plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      // 模拟 languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en-US', 'en'],
      });
      // 隐藏 Playwright/Automation 痕迹
      delete (window as any).__playwright;
      delete (window as any).__pw_manual;
    });

    // 注入 cookies（如果配置了）
    if (options.authConfig?.type === 'cookie' && options.authConfig.cookieFile) {
      await injectCookies(context, options.authConfig.cookieFile);
    }

    const page = await context.newPage();

    // 导航到目标页面
    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 等待页面渲染（给 JS 框架时间加载内容）
    await page.waitForTimeout(5000);

    // 检查是否有 iframe，如果有则切换到内容 frame
    const frames = page.frames();
    let workingFrame: Page | any = page;
    console.log(`[Scraper] 页面 frames 数量: ${frames.length}`);
    if (frames.length > 1) {
      for (const frame of frames) {
        if (frame === page.mainFrame()) continue;
        const frameUrl = frame.url();
        console.log(`[Scraper] 子frame URL: ${frameUrl}`);
        const content = await frame.evaluate(() => document.body?.innerText?.length || 0).catch(() => 0);
        console.log(`[Scraper] 子frame 内容长度: ${content}`);
        if (content > 50) {
          workingFrame = frame;
          console.log(`[Scraper] 切换到子frame执行操作`);
          break;
        }
      }
    } else {
      // 即使只有1个frame，也检查页面内容
      const mainContent = await page.evaluate(() => document.body?.innerText?.slice(0, 200) || '').catch(() => '');
      console.log(`[Scraper] 主页面内容预览: "${mainContent.slice(0, 100)}"`);
    }

    // 检查是否有 download 步骤
    const downloadStepIdx = options.steps?.findIndex(s => s.action === 'download') ?? -1;
    const hasDownloadStep = downloadStepIdx >= 0;

    if (hasDownloadStep && options.steps) {
      // === 下载型工作流 ===
      // 执行 download 之前的步骤
      const preSteps = options.steps.slice(0, downloadStepIdx);
      if (preSteps.length > 0) {
        await executeSteps(page, preSteps);
      }

      // 执行 download 步骤：点击触发下载并拦截文件
      const downloadStep = options.steps[downloadStepIdx];
      const clickSelector = downloadStep.selector || downloadStep.value || 'text=Download';
      const timeout = downloadStep.timeout || 30000;

      console.log(`[Scraper] 执行下载步骤: 点击 "${clickSelector}" 并等待下载...`);

      // 等待下载事件
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout }),
        smartClick(page, clickSelector, timeout),
      ]);

      console.log(`[Scraper] 下载开始: ${download.suggestedFilename()}`);

      // 等待下载完成并读取文件内容
      const filePath = await download.path();
      if (!filePath) {
        throw new Error('下载文件路径为空');
      }

      const fileName = download.suggestedFilename();
      console.log(`[Scraper] 下载完成: ${fileName}, 解析中...`);

      // 解析文件内容
      const result = await parseDownloadedFile(filePath, fileName, downloadStep.value);
      console.log(`[Scraper] 文件解析结果: ${result.data.length} 行, ${result.columns.length} 列`);

      await browser.close();
      return result;
    }

    // === 常规表格抓取工作流 ===
    if (options.steps?.length) {
      await executeSteps(workingFrame, options.steps);
    }

    // 等待表格出现（使用 attached 状态，增加超时）
    try {
      await workingFrame.waitForSelector(options.tableSelector, { state: 'attached', timeout: 30000 });
      console.log(`[Scraper] 找到表格选择器: ${options.tableSelector}`);
    } catch {
      console.log(`[Scraper] 未找到指定选择器 "${options.tableSelector}"，将尝试自动检测`);
    }
    // 额外等待确保数据渲染完成
    await page.waitForTimeout(2000);

    // 提取表格数据
    console.log(`[Scraper] 开始提取表格数据...`);
    const result = await extractTableData(workingFrame, options.tableSelector);
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
 * 直接 HTTP 下载文件并解析（不走 Playwright）
 * 适用于已知直接下载链接的场景（如 IEA 等有 Cloudflare 保护的网站）
 */
async function directDownloadFile(url: string, sheetName?: string): Promise<ScrapeResult> {
  try {
    const proxyServer = process.env.DOWNLOAD_PROXY || '';
    console.log(`[Scraper] 直接下载模式: ${url}${proxyServer ? ` (代理: ${proxyServer})` : ''}`);

    // 构建 fetch 请求（支持代理）
    const fetchOptions: any = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/octet-stream,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': new URL(url).origin + '/',
        'sec-ch-ua': '"Chromium";v="126", "Not A(Brand";v="8", "Google Chrome";v="126"',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'same-origin',
      },
      redirect: 'follow',
    };

    // 如果有代理，使用 undici 的 ProxyAgent
    let response: Response;
    if (proxyServer) {
      const { ProxyAgent, fetch: proxyFetch } = await import('undici');
      const agent = new ProxyAgent(proxyServer);
      response = await (proxyFetch as any)(url, { ...fetchOptions, dispatcher: agent }) as Response;
    } else {
      response = await fetch(url, fetchOptions);
    }

    if (!response.ok) {
      return { success: false, data: [], columns: [], error: `HTTP ${response.status}: ${response.statusText}` };
    }

    // 从 Content-Disposition 或 URL 推断文件名
    const contentDisposition = response.headers.get('content-disposition') || '';
    let fileName = 'download.xlsx';
    const filenameMatch = contentDisposition.match(/filename[*]?=["']?([^"';\n]+)/i);
    if (filenameMatch) {
      fileName = filenameMatch[1];
    } else {
      // 从 URL 路径提取文件名
      const urlPath = new URL(url).pathname;
      const urlFileName = urlPath.split('/').pop();
      if (urlFileName && /\.(xlsx|xls|csv)$/i.test(urlFileName)) {
        fileName = urlFileName;
      }
    }

    console.log(`[Scraper] 文件下载成功: ${fileName}, 解析中...`);

    // 读取为 Buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 写入临时文件并解析
    const { writeFileSync, unlinkSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const tmpPath = join(tmpdir(), `scraper-${Date.now()}-${fileName}`);
    writeFileSync(tmpPath, buffer);

    const result = await parseDownloadedFile(tmpPath, fileName, sheetName);

    // 清理临时文件
    try { unlinkSync(tmpPath); } catch {}

    console.log(`[Scraper] 直接下载解析结果: ${result.data.length} 行, ${result.columns.length} 列`);
    return result;
  } catch (error: any) {
    return { success: false, data: [], columns: [], error: `直接下载失败: ${error.message}` };
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
            // 尝试等待导航（点击链接可能跳转页面）
            try {
              await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {}),
                smartClick(page, step.selector, timeout),
              ]);
            } catch {
              await smartClick(page, step.selector, timeout);
            }
            await page.waitForTimeout(2000);
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
            await page.goto(step.value, { waitUntil: 'domcontentloaded', timeout });
          }
          break;
        case 'download':
          // download 动作在 executeSteps 中标记，实际处理在 executeScrape 主流程中
          break;
        case 'slideCaptcha':
          // 自动破解滑动拼图验证码
          await solveSlideCaptcha(page, timeout);
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
 * 自动破解滑动拼图验证码
 * 原理：
 * 1. 等待验证码弹窗出现
 * 2. 截取背景图和缺口图
 * 3. 通过像素对比找到缺口的 X 坐标
 * 4. 模拟人类拖动滑块到缺口位置
 */
async function solveSlideCaptcha(page: Page, timeout: number): Promise<void> {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[Scraper] 滑动验证码尝试 ${attempt}/${maxRetries}...`);

    try {
      // 等待验证码容器出现
      await page.waitForTimeout(2000);

      // 查找验证码图片（背景图带缺口）
      const captchaResult = await page.evaluate(() => {
        // 常见验证码容器选择器
        const selectors = [
          'canvas',
          'img[class*="captcha"]',
          'img[class*="verify"]',
          'img[class*="puzzle"]',
          '.verify-img-panel img',
          '.captcha-img img',
          '[class*="captcha"] img',
          '[class*="verify"] img',
        ];

        let bgImg: HTMLImageElement | HTMLCanvasElement | null = null;
        let sliderImg: HTMLImageElement | null = null;

        // 找到所有图片
        const allImgs = document.querySelectorAll('img');
        const captchaImgs: HTMLImageElement[] = [];
        allImgs.forEach(img => {
          const rect = img.getBoundingClientRect();
          // 验证码图片通常在弹窗中，宽度 200-400px
          if (rect.width >= 150 && rect.width <= 500 && rect.height >= 100 && rect.height <= 400) {
            captchaImgs.push(img);
          }
        });

        if (captchaImgs.length >= 1) {
          bgImg = captchaImgs[0]; // 最大的通常是背景图
        }

        // 也查找 canvas 元素
        const canvases = document.querySelectorAll('canvas');
        if (canvases.length > 0 && !bgImg) {
          bgImg = canvases[0] as HTMLCanvasElement;
        }

        if (!bgImg) return { found: false, gapX: 0, bgWidth: 0, sliderLeft: 0 };

        const bgRect = bgImg.getBoundingClientRect();

        // 找滑块元素
        const sliderSelectors = [
          '[class*="slider"] [class*="btn"]',
          '[class*="slider"] button',
          '[class*="drag"]',
          '[class*="handler"]',
          '.slide-verify-slider',
          'span[class*="slider"]',
        ];

        let sliderEl: Element | null = null;
        for (const sel of sliderSelectors) {
          sliderEl = document.querySelector(sel);
          if (sliderEl) break;
        }

        // 如果找不到特定滑块，找滑块轨道内的拖动按钮
        if (!sliderEl) {
          const btns = document.querySelectorAll('[class*="slider"] *, [class*="verify"] *');
          btns.forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width >= 30 && rect.width <= 60 && rect.height >= 30 && rect.height <= 60) {
              if (!sliderEl) sliderEl = el;
            }
          });
        }

        const sliderRect = sliderEl?.getBoundingClientRect();

        return {
          found: true,
          bgWidth: bgRect.width,
          bgHeight: bgRect.height,
          bgLeft: bgRect.left,
          bgTop: bgRect.top,
          sliderLeft: sliderRect?.left || bgRect.left,
          sliderTop: sliderRect?.top || bgRect.bottom - 30,
          sliderWidth: sliderRect?.width || 40,
          sliderHeight: sliderRect?.height || 40,
        };
      });

      if (!captchaResult.found) {
        console.log(`[Scraper] 未检测到验证码弹窗，可能已通过或不需要`);
        return;
      }

      console.log(`[Scraper] 检测到验证码: 背景宽=${captchaResult.bgWidth}, 滑块位置=(${captchaResult.sliderLeft}, ${captchaResult.sliderTop})`);

      // 截取验证码区域，通过像素分析找到缺口位置
      const gapX = await findCaptchaGap(page, captchaResult);

      if (gapX <= 0) {
        console.log(`[Scraper] 未能识别缺口位置，使用估算值`);
        // 缺口通常在图片 40%-75% 的位置
        const estimatedGap = captchaResult.bgWidth * (0.4 + Math.random() * 0.3);
        await dragSlider(page, captchaResult, estimatedGap);
      } else {
        console.log(`[Scraper] 缺口位置: x=${gapX}`);
        await dragSlider(page, captchaResult, gapX);
      }

      // 等待验证结果
      await page.waitForTimeout(2000);

      // 检查验证码是否消失（成功）
      const stillVisible = await page.evaluate(() => {
        const imgs = document.querySelectorAll('img');
        let captchaVisible = false;
        imgs.forEach(img => {
          const rect = img.getBoundingClientRect();
          if (rect.width >= 150 && rect.width <= 500 && rect.height >= 100 && rect.height <= 400 && rect.top > 0) {
            captchaVisible = true;
          }
        });
        return captchaVisible;
      });

      if (!stillVisible) {
        console.log(`[Scraper] 验证码通过！`);
        return;
      }

      console.log(`[Scraper] 验证码未通过，等待重试...`);
      await page.waitForTimeout(1500);
    } catch (err: any) {
      console.log(`[Scraper] 验证码处理异常: ${err.message}`);
      if (attempt === maxRetries) throw err;
      await page.waitForTimeout(2000);
    }
  }

  console.log(`[Scraper] 验证码多次尝试失败，继续执行后续步骤`);
}

/**
 * 通过截图分析找到拼图缺口的 X 坐标
 */
async function findCaptchaGap(page: Page, info: any): Promise<number> {
  try {
    // 对验证码区域截图
    const screenshot = await page.screenshot({
      clip: {
        x: info.bgLeft,
        y: info.bgTop,
        width: info.bgWidth,
        height: info.bgHeight,
      },
    });

    // 在页面内用 Canvas 分析像素，找到缺口（颜色突变区域）
    const gapX = await page.evaluate(async ({ imgBase64, width, height }: { imgBase64: string; width: number; height: number }) => {
      return new Promise<number>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, width, height);
          const pixels = imageData.data;

          // 逐列扫描，找到连续暗色区域（缺口阴影）
          const colBrightness: number[] = [];
          for (let x = 0; x < width; x++) {
            let colSum = 0;
            let count = 0;
            const startY = Math.floor(height * 0.2);
            const endY = Math.floor(height * 0.8);
            for (let y = startY; y < endY; y++) {
              const idx = (y * width + x) * 4;
              const r = pixels[idx];
              const g = pixels[idx + 1];
              const b = pixels[idx + 2];
              colSum += (r + g + b) / 3;
              count++;
            }
            colBrightness.push(colSum / count);
          }

          // 找到亮度突然下降的位置（缺口左边缘）
          const startScan = Math.floor(width * 0.25);
          let gapStart = 0;

          const avgBrightness = colBrightness.reduce((a, b) => a + b, 0) / colBrightness.length;

          for (let x = startScan; x < width - 20; x++) {
            let darkCols = 0;
            for (let dx = 0; dx < 8; dx++) {
              if (x + dx < width && colBrightness[x + dx] < avgBrightness * 0.85) {
                darkCols++;
              }
            }
            if (darkCols >= 5) {
              gapStart = x;
              break;
            }
          }

          resolve(gapStart);
        };
        img.src = 'data:image/png;base64,' + imgBase64;
      });
    }, { imgBase64: screenshot.toString('base64'), width: info.bgWidth, height: info.bgHeight });

    return gapX;
  } catch (err: any) {
    console.log(`[Scraper] 缺口分析失败: ${err.message}`);
    return 0;
  }
}

/**
 * 模拟人类拖动滑块到目标位置
 */
async function dragSlider(page: Page, info: any, targetX: number): Promise<void> {
  const startX = info.sliderLeft + info.sliderWidth / 2;
  const startY = info.sliderTop + info.sliderHeight / 2;
  const distance = targetX - (info.sliderWidth / 2); // 从滑块初始位置到缺口的距离

  console.log(`[Scraper] 拖动滑块: 起点=(${startX}, ${startY}), 距离=${distance}px`);

  // 模拟人类拖动轨迹：加速 → 匀速 → 减速
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(100 + Math.random() * 100);

  // 生成不规则轨迹
  const steps = 20 + Math.floor(Math.random() * 10);
  let currentX = startX;

  for (let i = 0; i < steps; i++) {
    const progress = i / steps;
    // 缓动函数：先快后慢
    const eased = 1 - Math.pow(1 - progress, 3);
    const targetPos = startX + distance * eased;
    // 加入随机抖动（±2px）
    const jitterX = (Math.random() - 0.5) * 4;
    const jitterY = (Math.random() - 0.5) * 3;
    currentX = targetPos + jitterX;

    await page.mouse.move(currentX, startY + jitterY);
    await page.waitForTimeout(10 + Math.random() * 20);
  }

  // 最后精确到位
  await page.mouse.move(startX + distance, startY);
  await page.waitForTimeout(50 + Math.random() * 100);
  await page.mouse.up();
}

/**
 * 从页面提取表格数据
 * 支持标准 <table> 和 div 模拟的表格
 */
async function extractTableData(page: Page, selector: string): Promise<ScrapeResult> {
  // 先检查元素是否存在
  const elementInfo = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false, tag: '', childCount: 0, html: '' };
    return {
      found: true,
      tag: el.tagName.toLowerCase(),
      childCount: el.children.length,
      html: el.outerHTML.slice(0, 1000),
    };
  }, selector);

  console.log(`[Scraper] 表格元素检测: found=${elementInfo.found}, tag=${elementInfo.tag}, children=${elementInfo.childCount}`);
  if (elementInfo.found) {
    console.log(`[Scraper] 表格HTML片段: ${elementInfo.html}`);
  }

  if (!elementInfo.found) {
    // 如果指定选择器找不到，尝试自动检测页面上的表格类结构
    console.log(`[Scraper] 指定选择器未找到，尝试自动检测表格...`);
    return await autoExtractTable(page);
  }

  if (elementInfo.tag === 'table') {
    // 先检测是否为 Element UI table 的分离结构
    const elTableResult = await extractElementUITable(page);
    if (elTableResult.success && elTableResult.data.length > 0) {
      return elTableResult;
    }

    // 再尝试多表格合并策略（处理横向分离的表格）
    const mergedResult = await extractMergedTables(page);
    if (mergedResult.success && mergedResult.data.length > 0) {
      return mergedResult;
    }

    // 回退到标准单表提取
    const result = await extractStandardTable(page, selector);
    if (result.data.length <= 1) {
      console.log(`[Scraper] 标准提取数据不足(${result.data.length}行)，尝试自动检测`);
      const autoResult = await autoExtractTable(page);
      if (autoResult.data.length > result.data.length) {
        return autoResult;
      }
    }
    return result;
  } else {
    return await extractDivTable(page, selector);
  }
}

/**
 * 提取 Element UI el-table 组件的数据
 * headless 模式下固定列 is-hidden 的 td 的 innerText 为空
 * 所以改用 textContent 读取 .cell 内的 span 文本
 */
async function extractElementUITable(page: Page): Promise<ScrapeResult> {
  const result = await page.evaluate(() => {
    const elTable = document.querySelector('.el-table');
    if (!elTable) return { success: false, data: [], columns: [], error: '非 Element UI 表格' };

    // 从 .cell 中提取文本的辅助函数（用 textContent 兼容 is-hidden）
    function getCellText(cell: Element): string {
      // 优先取第一个 span 的文本（排除排序箭头等）
      const span = cell.querySelector('span:not(.caret-wrapper)');
      if (span) return (span.textContent || '').trim();
      return (cell.textContent || '').trim();
    }

    // 提取表头
    const headers: string[] = [];
    const headerWrapper = elTable.querySelector('.el-table__header-wrapper');
    if (headerWrapper) {
      const ths = headerWrapper.querySelectorAll('th');
      ths.forEach(th => {
        const cell = th.querySelector('.cell');
        if (cell) {
          headers.push(getCellText(cell));
        }
      });
    }

    if (headers.length === 0) return { success: false, data: [], columns: [], error: '未找到表头' };

    // 提取数据行：读取 body-wrapper 内所有 tr 的所有 td
    const data: Record<string, any>[] = [];
    const bodyWrapper = elTable.querySelector('.el-table__body-wrapper');
    if (!bodyWrapper) return { success: false, data: [], columns: headers, error: '未找到body' };

    const rows = bodyWrapper.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const tds = row.querySelectorAll('td');
      const rowData: Record<string, any> = {};
      let colIdx = 0;

      tds.forEach(td => {
        const cell = td.querySelector('.cell');
        if (!cell) return;
        const text = getCellText(cell);
        const key = headers[colIdx] || `col_${colIdx}`;
        const num = Number(text.replace(/,/g, ''));
        rowData[key] = isNaN(num) || text === '' ? text : num;
        colIdx++;
      });

      if (colIdx > 0 && Object.values(rowData).some(v => v !== '' && v !== undefined)) {
        data.push(rowData);
      }
    });

    return {
      success: data.length > 0,
      data,
      columns: headers,
      error: data.length === 0 ? 'Element UI表格未提取到数据' : undefined,
    };
  });

  console.log(`[Scraper] Element UI 表格提取: success=${result.success}, ${result.data.length} 行, columns=[${result.columns.join(',')}], error=${result.error || 'none'}`);
  return result as ScrapeResult;
}

/**
 * 提取标准 <table> 元素的数据
 */
async function extractStandardTable(page: Page, selector: string): Promise<ScrapeResult> {
  const result = await page.evaluate((sel) => {
    const table = document.querySelector(sel);
    if (!table) return { success: false, data: [], columns: [], error: '未找到表格元素' };

    // 调试：输出表格结构
    const debugInfo = {
      innerHTML: table.innerHTML.slice(0, 200),
      childTags: Array.from(table.children).map(c => c.tagName.toLowerCase()),
      tbodyCount: table.querySelectorAll('tbody').length,
      trCount: table.querySelectorAll('tr').length,
      tdCount: table.querySelectorAll('td').length,
    };
    console.log('Table debug:', JSON.stringify(debugInfo));

    // 提取表头
    const headers: string[] = [];
    const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
    if (headerRow) {
      headerRow.querySelectorAll('th, td').forEach((cell) => {
        const text = (cell as HTMLElement).innerText.trim();
        if (text) headers.push(text);
      });
    }

    // 提取数据行 - 多种策略
    const data: Record<string, any>[] = [];

    // 策略1: tbody 中的 tr
    let dataRows = table.querySelectorAll('tbody tr');

    // 策略2: 如果 tbody 没有 tr，尝试所有 tr（跳过第一行表头）
    if (dataRows.length === 0) {
      const allRows = table.querySelectorAll('tr');
      dataRows = allRows.length > 1
        ? (document.querySelectorAll(`${sel} tr:not(:first-child)`) as NodeListOf<Element>)
        : allRows;
    }

    dataRows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      // 如果没有 td，尝试 th（有些表格数据行也用 th）
      const allCells = cells.length > 0 ? cells : row.querySelectorAll('th');
      if (allCells.length === 0) return;

      // 跳过表头行（如果混在数据行里）
      const firstCellText = (allCells[0] as HTMLElement).innerText.trim();
      if (headers.length > 0 && firstCellText === headers[0]) return;

      const rowData: Record<string, any> = {};
      allCells.forEach((cell, idx) => {
        const key = headers[idx] || `col_${idx}`;
        const value = (cell as HTMLElement).innerText.trim();
        const num = Number(value.replace(/,/g, ''));
        rowData[key] = isNaN(num) || value === '' ? value : num;
      });

      // 只添加非空行
      if (Object.values(rowData).some(v => v !== '' && v !== undefined)) {
        data.push(rowData);
      }
    });

    // 策略3: 如果还是没数据，尝试直接解析 innerText
    if (data.length === 0) {
      const text = (table as HTMLElement).innerText;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length >= 2) {
        // 第一行是表头（已经有了），从第二行开始解析
        for (let i = 1; i < lines.length; i++) {
          const cells = lines[i].split('\t').filter(c => c.trim() !== '');
          if (cells.length < 2) continue;
          const rowData: Record<string, any> = {};
          cells.forEach((cell, idx) => {
            const key = headers[idx] || `col_${idx}`;
            const value = cell.trim();
            const num = Number(value.replace(/,/g, ''));
            rowData[key] = isNaN(num) || value === '' ? value : num;
          });
          data.push(rowData);
        }
      }
    }

    return {
      success: data.length > 0,
      data,
      columns: headers,
      error: data.length === 0 ? `表格有 ${debugInfo.trCount} 个tr, ${debugInfo.tdCount} 个td，但未能提取数据` : undefined,
    };
  }, selector);

  // 打印 evaluate 中的 console.log
  console.log(`[Scraper] 标准表格提取: ${result.data.length} 行, ${result.columns.length} 列`);
  if (result.error) console.log(`[Scraper] 提取问题: ${result.error}`);

  return result as ScrapeResult;
}

/**
 * 合并多表格提取策略
 * 很多数据网站（如国家统计局）把固定列（指标名称）和数据列分成多个 table：
 * - 左侧 table 包含行标题（指标名）
 * - 右侧 table 包含年份数据
 * 这个函数会检测这种模式，横向合并对应行
 */
async function extractMergedTables(page: Page): Promise<ScrapeResult> {
  const result = await page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    if (tables.length === 0) return { success: false, data: [], columns: [], error: '无table' };

    // ============================================================
    // 策略 A: 横向合并（左侧指标列 + 右侧数据列）
    // 国家统计局等网站的典型模式：多个并排 table
    // 左表含指标名（1-2列），右表含年份数据（多列）
    // ============================================================
    interface TableData {
      headers: string[];
      rows: string[][];
      el: Element;
    }

    const tablesData: TableData[] = [];

    for (const table of tables) {
      const tRows = table.querySelectorAll('tr');
      if (tRows.length === 0) continue;

      const tableHeaders: string[] = [];
      const tableRows: string[][] = [];

      for (let i = 0; i < tRows.length; i++) {
        const cells = tRows[i].querySelectorAll('th, td');
        const rowTexts: string[] = [];
        cells.forEach(cell => {
          rowTexts.push((cell as HTMLElement).innerText.trim());
        });
        if (rowTexts.length === 0) continue;

        // 判断是否为表头行：必须包含年份模式或"指标"关键字
        // 且这一行必须是第一行或紧跟在第一行后
        const hasYearPattern = rowTexts.some(t => /^\d{4}年?$/.test(t));
        const isIndicatorHeader = rowTexts.length <= 2 && rowTexts.includes('指标');
        const isHeader = (hasYearPattern || isIndicatorHeader) && tableHeaders.length === 0;

        if (isHeader) {
          tableHeaders.push(...rowTexts);
        } else {
          tableRows.push(rowTexts);
        }
      }

      if (tableHeaders.length > 0 || tableRows.length > 0) {
        tablesData.push({ headers: tableHeaders, rows: tableRows, el: table });
      }
    }

    // 横向合并检测：找行数相同的两个表，一个窄（指标），一个宽（数据）
    if (tablesData.length >= 2) {
      // 按行数分组，找到行数匹配的表对
      for (let i = 0; i < tablesData.length; i++) {
        for (let j = i + 1; j < tablesData.length; j++) {
          const tA = tablesData[i];
          const tB = tablesData[j];
          // 行数相近（允许 ±1 差异）
          if (Math.abs(tA.rows.length - tB.rows.length) > 1) continue;
          if (tA.rows.length === 0 && tB.rows.length === 0) continue;

          // 判断哪个是指标表（窄），哪个是数据表（宽）
          const aMaxCols = Math.max(tA.headers.length, ...(tA.rows.map(r => r.length)));
          const bMaxCols = Math.max(tB.headers.length, ...(tB.rows.map(r => r.length)));

          let leftTable: TableData;
          let rightTable: TableData;

          if (aMaxCols <= 2 && bMaxCols > 2) {
            leftTable = tA; rightTable = tB;
          } else if (bMaxCols <= 2 && aMaxCols > 2) {
            leftTable = tB; rightTable = tA;
          } else if (tA.headers.includes('指标') || tA.headers.some(h => h === '')) {
            leftTable = tA; rightTable = tB;
          } else if (tB.headers.includes('指标') || tB.headers.some(h => h === '')) {
            leftTable = tB; rightTable = tA;
          } else {
            // 也可以通过检查：含年份的是数据表
            if (tB.headers.some(h => /^\d{4}年/.test(h))) {
              leftTable = tA; rightTable = tB;
            } else if (tA.headers.some(h => /^\d{4}年/.test(h))) {
              leftTable = tB; rightTable = tA;
            } else {
              continue;
            }
          }

          // 横向合并
          const mergedHeaders = [
            ...(leftTable.headers.length > 0 ? leftTable.headers : ['指标']),
            ...rightTable.headers,
          ];
          const mergedData: Record<string, any>[] = [];
          const maxRows = Math.min(leftTable.rows.length, rightTable.rows.length);

          for (let r = 0; r < maxRows; r++) {
            const leftRow = leftTable.rows[r] || [];
            const rightRow = rightTable.rows[r] || [];
            const combinedCells = [...leftRow, ...rightRow];

            const rowData: Record<string, any> = {};
            combinedCells.forEach((cell, idx) => {
              const key = mergedHeaders[idx] || `col_${idx}`;
              const num = Number(cell.replace(/,/g, ''));
              rowData[key] = isNaN(num) || cell === '' ? cell : num;
            });

            if (Object.values(rowData).some(v => v !== '' && v !== undefined)) {
              mergedData.push(rowData);
            }
          }

          if (mergedData.length > 0) {
            return { success: true, data: mergedData, columns: mergedHeaders, error: undefined };
          }
        }
      }
    }

    // ============================================================
    // 策略 B: 如果检测不到横向分离，尝试简单合并所有表的数据行
    // ============================================================
    let allHeaders: string[] = [];
    let allDataRows: string[][] = [];

    for (const td of tablesData) {
      if (td.headers.length > 0 && allHeaders.length === 0) {
        allHeaders = td.headers;
      }
      allDataRows.push(...td.rows);
    }

    // 如果没有通过 tr 拿到数据，尝试用 innerText 整体解析
    if (allDataRows.length === 0) {
      const containers = document.querySelectorAll('[class*="table"], [class*="data"], [class*="grid"]');
      for (const container of containers) {
        const text = (container as HTMLElement).innerText;
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 3) continue;

        for (let i = 0; i < lines.length; i++) {
          const cells = lines[i].split('\t').filter(Boolean);
          if (cells.length < 2) continue;

          const isHeader = cells.some(t => /^\d{4}年/.test(t) || t === '指标');
          if (isHeader && allHeaders.length === 0) {
            allHeaders = cells;
          } else if (!isHeader) {
            allDataRows.push(cells);
          }
        }
        if (allDataRows.length > 0) break;
      }
    }

    // 策略 C: 最后尝试全页面文本解析
    if (allDataRows.length === 0) {
      const bodyText = document.body.innerText;
      const lines = bodyText.split('\n').map(l => l.trim()).filter(Boolean);
      
      let headerIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/\d{4}年/.test(lines[i]) && lines[i].split('\t').length >= 2) {
          headerIdx = i;
          allHeaders = lines[i].split('\t').filter(Boolean);
          break;
        }
      }

      if (headerIdx >= 0) {
        for (let i = headerIdx + 1; i < lines.length; i++) {
          const cells = lines[i].split('\t').filter(Boolean);
          if (cells.length >= 2) {
            allDataRows.push(cells);
          } else {
            if (allDataRows.length > 0) break;
          }
        }
      }
    }

    if (allDataRows.length === 0) {
      return { success: false, data: [], columns: allHeaders, error: '多表格合并策略未提取到数据行' };
    }

    // 构建数据
    const data: Record<string, any>[] = [];
    for (const row of allDataRows) {
      const rowData: Record<string, any> = {};
      row.forEach((cell, idx) => {
        const key = allHeaders[idx] || `col_${idx}`;
        const num = Number(cell.replace(/,/g, ''));
        rowData[key] = isNaN(num) || cell === '' ? cell : num;
      });
      const values = Object.values(rowData);
      if (values.some(v => v !== '' && v !== undefined) && !values.every(v => /^\d{4}年$/.test(String(v)))) {
        data.push(rowData);
      }
    }

    return {
      success: data.length > 0,
      data,
      columns: allHeaders,
      error: data.length === 0 ? '合并后无有效数据' : undefined,
    };
  });

  console.log(`[Scraper] 多表格合并提取: ${result.data.length} 行, columns=[${result.columns.join(',')}]`);
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

/**
 * 解析下载的文件（Excel/CSV）为表格数据
 * @param filePath 临时文件路径
 * @param fileName 文件名（用于判断格式）
 * @param sheetName 可选的 Sheet 名称（用于多 Sheet Excel）
 */
async function parseDownloadedFile(filePath: string, fileName: string, sheetName?: string): Promise<ScrapeResult> {
  try {
    const buffer = readFileSync(filePath);
    const ext = fileName.toLowerCase().split('.').pop();

    if (ext === 'csv') {
      const text = buffer.toString('utf-8');
      return parseCSVText(text);
    }

    // Excel 解析 (xlsx, xls) - 使用 Function 包装避免 Vite 静态分析
    const loadXlsx = new Function('return import("xlsx")');
    const XLSX = await loadXlsx();
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // 选择 Sheet
    let targetSheet: string;
    if (sheetName && workbook.SheetNames.includes(sheetName)) {
      targetSheet = sheetName;
    } else {
      targetSheet = workbook.SheetNames[0];
    }

    console.log(`[Scraper] Excel Sheets: [${workbook.SheetNames.join(', ')}], 使用: ${targetSheet}`);

    const worksheet = workbook.Sheets[targetSheet];
    const jsonData: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (jsonData.length === 0) {
      return { success: false, data: [], columns: [], error: '文件内无数据' };
    }

    // 提取列名
    const columns = Object.keys(jsonData[0]);

    // 转换数值
    const data = jsonData.map((row: Record<string, any>) => {
      const cleaned: Record<string, any> = {};
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'number') {
          cleaned[key] = value;
        } else if (typeof value === 'string') {
          const num = Number(value.replace(/,/g, ''));
          cleaned[key] = isNaN(num) || value === '' ? value : num;
        } else {
          cleaned[key] = value;
        }
      }
      return cleaned;
    });

    return { success: true, data, columns };
  } catch (error: any) {
    return { success: false, data: [], columns: [], error: `文件解析失败: ${error.message}` };
  }
}

/**
 * 解析 CSV 文本为表格数据
 */
function parseCSVText(text: string): ScrapeResult {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return { success: false, data: [], columns: [], error: 'CSV 行数不足' };
  }

  // 检测分隔符（逗号或分号）
  const sep = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const columns = lines[0].split(sep).map(c => c.replace(/^["']|["']$/g, '').trim());

  const data: Record<string, any>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep).map(c => c.replace(/^["']|["']$/g, '').trim());
    const row: Record<string, any> = {};
    cells.forEach((cell, idx) => {
      const key = columns[idx] || `col_${idx}`;
      const num = Number(cell.replace(/,/g, ''));
      row[key] = isNaN(num) || cell === '' ? cell : num;
    });
    data.push(row);
  }

  return { success: data.length > 0, data, columns };
}
