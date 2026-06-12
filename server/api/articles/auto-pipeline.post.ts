import { eq, inArray } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

/**
 * POST /api/articles/auto-pipeline
 * 自动流水线：分类 → 下载正文 → 向量化
 * 传入 articleIds（刚同步的文章），SSE 流式返回进度
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ articleIds: number[] }>(event);
  if (!body?.articleIds?.length) {
    throw createError({ statusCode: 400, message: '请提供 articleIds' });
  }

  const db = useDB();
  const res = event.node.res;
  setResponseHeaders(event, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });

  const sendEvent = (data: any) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`); };

  // 加载分类规则
  const rules = await db.select().from(schema.filterRules).where(eq(schema.filterRules.enabled, true));
  const excludeRules = rules.filter(r => r.type === 'exclude');
  const includeRules = rules.filter(r => r.type === 'include').sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

  // 获取文章
  const articles = await db.select({
    id: schema.articles.id,
    title: schema.articles.title,
    content: schema.articles.content,
    sourceId: schema.articles.sourceId,
    filterStatus: schema.articles.filterStatus,
    downloadStatus: schema.articles.downloadStatus,
    vectorized: schema.articles.vectorized,
  }).from(schema.articles).where(inArray(schema.articles.id, body.articleIds));

  // 只处理 pending 状态的文章
  const pending = articles.filter(a => a.filterStatus === 'pending');
  if (!pending.length) {
    sendEvent({ type: 'done', classified: 0, downloaded: 0, vectorized: 0, total: 0 });
    res.end(); return;
  }

  sendEvent({ type: 'phase', phase: 'classify', message: `开始分类 ${pending.length} 篇文章...` });

  // ===== Phase 1: 分类 =====
  const acceptedArticles: { id: number; title: string; topic: string }[] = [];

  for (const article of pending) {
    const titleText = article.title || '';
    // 去除非正文区域（script/style/注释/head）和 HTML 标签，只匹配可见文字
    const rawContent = article.content || '';
    const contentText = rawContent
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<head[\s\S]*?<\/head>/gi, '')
      .replace(/data:[^"'\s]+/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');

    // 排除规则
    let isRejected = false;
    for (const rule of excludeRules) {
      const hitTitle = (rule.titleKeywords as string[]).find(kw => titleText.includes(kw));
      const hitContent = (rule.contentKeywords as string[]).find(kw => contentText.includes(kw));
      if (hitTitle || hitContent) {
        isRejected = true;
        const reason = `${hitTitle ? '标题' : '摘要'}命中排除词「${hitTitle || hitContent}」`;
        await db.update(schema.articles).set({ filterStatus: 'rejected', rejectReason: reason, updatedAt: new Date() }).where(eq(schema.articles.id, article.id));
        break;
      }
    }
    if (isRejected) continue;

    // 正向规则
    let matchedTopic: string | null = null;
    let matchedKeywordsJson: string | null = null;

    for (const rule of includeRules) {
      const titleKw = (rule.titleKeywords as string[]).find(kw => titleText.includes(kw));
      if (titleKw) {
        matchedTopic = rule.topic;
        matchedKeywordsJson = JSON.stringify([{ keyword: titleKw, source: 'title' }]);
        break;
      }
      const contentKw = (rule.contentKeywords as string[]).find(kw => contentText.includes(kw));
      if (contentKw) {
        matchedTopic = rule.topic;
        matchedKeywordsJson = JSON.stringify([{ keyword: contentKw, source: 'content' }]);
        break;
      }
      if (rule.requireAll && rule.groups && (rule.groups as string[][]).length > 0) {
        const fullText = titleText + ' ' + contentText;
        const allGroupsMatched = (rule.groups as string[][]).every(g => g.some(kw => fullText.includes(kw)));
        if (allGroupsMatched) {
          matchedTopic = rule.topic;
          matchedKeywordsJson = JSON.stringify((rule.groups as string[][]).map(g => ({ keyword: g.find(k => fullText.includes(k))!, source: 'group' })));
          break;
        }
      }
    }

    if (matchedTopic) {
      await db.update(schema.articles).set({
        filterStatus: 'accepted', matchedTopic, classifyMethod: 'keyword', matchedKeywordsJson, updatedAt: new Date(),
      }).where(eq(schema.articles.id, article.id));

      acceptedArticles.push({ id: article.id, title: article.title, topic: matchedTopic });

      sendEvent({
        type: 'match',
        articleId: article.id,
        title: article.title,
        topic: matchedTopic,
        message: `「${article.title}」符合「${matchedTopic}」分类规则`,
      });
    }
  }

  sendEvent({ type: 'phase', phase: 'classify-done', classified: acceptedArticles.length, total: pending.length });

  // 同步后只做分类标记，不自动下载正文和向量化（留给手动"执行筛选"时处理）
  sendEvent({ type: 'done', classified: acceptedArticles.length, downloaded: 0, vectorized: 0, total: pending.length });
  console.log(`[AutoPipeline] 完成: 分类通过=${acceptedArticles.length}/${pending.length}（仅标记，未下载/向量化）`);
  res.end();
});
