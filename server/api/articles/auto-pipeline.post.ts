import { eq, and, inArray, isNotNull } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { matchByKeywords } from '~/server/utils/classification';
import { articleDownloader } from '~/server/utils/wechat/article-downloader';
import { generateEmbeddings, splitIntoChunks } from '~/server/utils/embedding';

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
    digest: schema.articles.digest,
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
    const contentText = article.content || article.digest || '';

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
    const hasContent = !!article.content;

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
        matchedKeywordsJson = JSON.stringify([{ keyword: contentKw, source: hasContent ? 'content' : 'digest' }]);
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
        message: `「${article.title}」符合「${matchedTopic}」分类规则，正在自动下载正文和向量化`,
      });
    }
  }

  sendEvent({ type: 'phase', phase: 'classify-done', classified: acceptedArticles.length, total: pending.length });

  if (!acceptedArticles.length) {
    sendEvent({ type: 'done', classified: 0, downloaded: 0, vectorized: 0, total: pending.length });
    res.end(); return;
  }

  // ===== Phase 2: 下载正文 =====
  // 找出通过分类但缺正文的文章
  const needDownloadIds = acceptedArticles
    .filter(a => {
      const orig = articles.find(x => x.id === a.id);
      return orig && !orig.content;
    })
    .map(a => a.id);

  let downloadedCount = 0;
  if (needDownloadIds.length > 0) {
    sendEvent({ type: 'phase', phase: 'download', message: `正在下载 ${needDownloadIds.length} 篇正文...` });

    await articleDownloader.start(needDownloadIds, 3, (progressEvent) => {
      if (progressEvent.type === 'completed') {
        downloadedCount++;
        sendEvent({ type: 'download-progress', completed: downloadedCount, total: needDownloadIds.length });
      } else if (progressEvent.type === 'failed' || progressEvent.type === 'deleted') {
        sendEvent({ type: 'download-progress', completed: downloadedCount, total: needDownloadIds.length, failed: progressEvent.articleId });
      }
    });

    sendEvent({ type: 'phase', phase: 'download-done', downloaded: downloadedCount, total: needDownloadIds.length });
  }

  // ===== Phase 3: 向量化 =====
  // 获取有正文且未向量化的已通过文章
  const toVectorize = await db.query.articles.findMany({
    where: and(
      inArray(schema.articles.id, acceptedArticles.map(a => a.id)),
      eq(schema.articles.vectorized, false),
      isNotNull(schema.articles.content),
    ),
  });

  let vectorizedCount = 0;
  if (toVectorize.length > 0) {
    sendEvent({ type: 'phase', phase: 'vectorize', message: `正在向量化 ${toVectorize.length} 篇文章...` });

    for (let i = 0; i < toVectorize.length; i++) {
      const article = toVectorize[i];
      const text = article.content || `${article.title}\n${article.digest || ''}`;
      const chunks = splitIntoChunks(text);
      if (!chunks.length) continue;

      try {
        await db.delete(schema.articleChunks).where(eq(schema.articleChunks.articleId, article.id));
        const embeddings = await generateEmbeddings(chunks);
        for (let j = 0; j < chunks.length; j++) {
          await db.insert(schema.articleChunks).values({ articleId: article.id, chunkIndex: j, content: chunks[j], embedding: embeddings[j] });
        }
        await db.update(schema.articles).set({ vectorized: true, updatedAt: new Date() }).where(eq(schema.articles.id, article.id));
        vectorizedCount++;
        sendEvent({ type: 'vectorize-progress', current: i + 1, total: toVectorize.length, title: article.title });
      } catch (e: any) {
        console.error(`[AutoPipeline] 向量化失败 ${article.id}:`, e.message);
      }
    }

    sendEvent({ type: 'phase', phase: 'vectorize-done', vectorized: vectorizedCount, total: toVectorize.length });
  }

  sendEvent({ type: 'done', classified: acceptedArticles.length, downloaded: downloadedCount, vectorized: vectorizedCount, total: pending.length });
  console.log(`[AutoPipeline] 完成: 分类通过=${acceptedArticles.length}, 下载=${downloadedCount}, 向量化=${vectorizedCount}`);
  res.end();
});
