import { eq, isNull } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

/**
 * 抓取文章正文内容
 * 通过 link 字段访问微信文章页面，提取正文文本
 * 
 * body: { articleIds?: number[]; all?: boolean }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ articleIds?: number[]; all?: boolean }>(event);
  const db = useDB();

  let articles;
  if (body?.articleIds?.length) {
    articles = await db.query.articles.findMany({
      where: isNull(schema.articles.content),
    });
    articles = articles.filter(a => body.articleIds!.includes(a.id));
  } else if (body?.all) {
    articles = await db.query.articles.findMany({
      where: isNull(schema.articles.content),
    });
  } else {
    throw createError({ statusCode: 400, message: '请指定 articleIds 或 all: true' });
  }

  if (!articles.length) {
    return { success: true, fetched: 0, message: '没有需要抓取正文的文章' };
  }

  let fetchedCount = 0;
  let failedCount = 0;

  for (const article of articles) {
    try {
      // 通过微信文章链接抓取正文
      const response = await fetch(article.link, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        failedCount++;
        continue;
      }

      const html = await response.text();

      // 提取正文文本（简单提取 js_content 区域）
      const contentMatch = html.match(/id="js_content"[^>]*>([\s\S]*?)<\/div>\s*<script/);
      if (!contentMatch) {
        // 备选：提取所有 <p> 标签内容
        const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/g);
        if (paragraphs) {
          const text = paragraphs
            .map(p => p.replace(/<[^>]+>/g, '').trim())
            .filter(Boolean)
            .join('\n\n');

          if (text.length > 50) {
            await db.update(schema.articles)
              .set({ content: text, updatedAt: new Date() })
              .where(eq(schema.articles.id, article.id));
            fetchedCount++;
            continue;
          }
        }
        failedCount++;
        continue;
      }

      // 清除 HTML 标签，保留纯文本
      const text = contentMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();

      if (text.length > 20) {
        await db.update(schema.articles)
          .set({ content: text, updatedAt: new Date() })
          .where(eq(schema.articles.id, article.id));
        fetchedCount++;
      } else {
        failedCount++;
      }

      // 请求间隔，避免被封
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e: any) {
      console.error(`抓取文章 ${article.id} 正文失败:`, e.message);
      failedCount++;
    }
  }

  return { success: true, fetched: fetchedCount, failed: failedCount, total: articles.length };
});
