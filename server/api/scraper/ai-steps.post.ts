import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

/**
 * AI 辅助生成操作步骤
 * 1. 打开目标页面，提取精简 DOM 结构
 * 2. 结合用户的自然语言描述，让 LLM 生成 Playwright 操作步骤
 */
export default defineEventHandler(async (event) => {
  const { url, instruction } = await readBody(event);
  if (!url) throw createError({ statusCode: 400, message: '缺少 URL' });
  if (!instruction) throw createError({ statusCode: 400, message: '请描述你想要获取的数据' });

  const chromePath = findChromePath();
  if (!chromePath) {
    throw createError({ statusCode: 500, message: '未找到 Chrome 浏览器' });
  }

  let browser;
  try {
    // Step 1: 打开页面，提取精简 DOM
    browser = await chromium.launch({ headless: true, executablePath: chromePath });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 提取页面的可交互元素摘要（精简版 DOM）
    const pageStructure = await page.evaluate(() => {
      function getSelector(el: Element): string {
        if (el.id) return `#${el.id}`;
        if (el.className && typeof el.className === 'string') {
          const cls = el.className.trim().split(/\s+/).slice(0, 2).join('.');
          if (cls) return `${el.tagName.toLowerCase()}.${cls}`;
        }
        return el.tagName.toLowerCase();
      }

      function extractInteractiveElements(root: Element, depth = 0, maxDepth = 4): string[] {
        if (depth > maxDepth) return [];
        const results: string[] = [];
        const indent = '  '.repeat(depth);

        for (const child of Array.from(root.children)) {
          const tag = child.tagName.toLowerCase();
          const text = (child as HTMLElement).innerText?.trim().slice(0, 50) || '';
          const selector = getSelector(child);

          // 记录可交互元素和有文本的导航/菜单项
          const isInteractive = ['a', 'button', 'input', 'select', 'option', 'li', 'label'].includes(tag);
          const isContainer = ['div', 'ul', 'ol', 'nav', 'aside', 'section', 'form', 'table'].includes(tag);
          const hasClickHandler = child.hasAttribute('onclick') || child.getAttribute('role') === 'button';
          const isTreeNode = child.classList.contains('tree-node') || child.classList.contains('dtTree') ||
            child.querySelector('[class*="tree"]') !== null;

          if (isInteractive || hasClickHandler || isTreeNode) {
            results.push(`${indent}[${selector}] "${text}"`);
          } else if (isContainer && text) {
            results.push(`${indent}<${selector}> "${text.slice(0, 30)}"`);
            // 递归子元素
            const children = extractInteractiveElements(child, depth + 1, maxDepth);
            results.push(...children);
          }
        }
        return results;
      }

      const title = document.title;
      const elements = extractInteractiveElements(document.body);
      return { title, elements: elements.slice(0, 150) }; // 限制长度
    });

    await browser.close();
    browser = null;

    // Step 2: 调用 LLM 生成操作步骤
    const config = useRuntimeConfig();
    const systemPrompt = `你是一个网页自动化专家。用户会给你一个网页的结构摘要和他们想要获取的数据描述。
你需要生成 Playwright 操作步骤来帮助用户获取目标数据。

页面结构格式说明：
- [selector] "text" 表示可点击/可交互的元素
- <selector> "text" 表示容器元素

你需要返回一个 JSON 数组，每个步骤的格式为：
{
  "action": "click" | "waitForSelector" | "wait" | "type" | "select",
  "selector": "选择器",
  "value": "输入值（type/select时需要）",
  "timeout": 毫秒数（wait时需要，默认用2000）,
  "description": "这一步做什么（中文描述）"
}

选择器规则（非常重要）：
1. 文本匹配用 "text=精确文本" 格式，如 text=简单查询、text=能源
2. 不要使用 :has-text() 伪选择器
3. 如果页面结构中有明确的 CSS 选择器（如 #id 或 .class），优先使用
4. 对于树形菜单的节点，使用 "text=节点名称" 格式
5. 对于下拉框/选择器，使用 select 动作，selector 填下拉框触发器的选择器（如 text=请选择 或 CSS选择器），value 填要选择的选项文本
6. 如果不确定下拉框的选择器，可以用 click 动作先点击下拉触发区域，再用另一个 click 点击选项文本

操作规则：
1. 只返回 JSON 数组，不要其他文字
2. 每个 click 操作后加一个 wait 步骤（1500-2000ms）让页面响应
3. 不要使用 waitForSelector 步骤，用 wait 代替
4. 保持步骤简洁，通常4-8步即可
5. 对于 SPA 页面，页面加载后第一步建议先 wait 2000ms`;

    const userPrompt = `页面标题: ${pageStructure.title}
页面URL: ${url}

页面结构:
${pageStructure.elements.join('\n')}

用户需求: ${instruction}

请生成操作步骤（JSON数组）:`;

    const response = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: config.chatModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM 请求失败: ${response.status}`);
    }

    const result = await response.json() as any;
    const content = result.choices?.[0]?.message?.content || '';

    // 解析 LLM 返回的 JSON
    let steps = [];
    try {
      // 尝试直接解析
      steps = JSON.parse(content);
    } catch {
      // 尝试从 markdown 代码块中提取
      const match = content.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      if (match) {
        steps = JSON.parse(match[1].trim());
      }
    }

    if (!Array.isArray(steps)) {
      throw new Error('AI 未能生成有效的操作步骤');
    }

    return {
      steps,
      pageTitle: pageStructure.title,
    };
  } catch (error: any) {
    if (browser) await browser.close();
    throw createError({
      statusCode: 500,
      message: error.message || 'AI 步骤生成失败',
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
