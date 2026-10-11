import { eq, and, isNotNull, gte, lte, ne } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { generateEmbeddings, splitIntoChunks } from '~/server/utils/embedding';

/**
 * POST /api/articles/vectorize-range
 * 对指定日期区间的文章进行向量化（排除被排除的文章）
 * 支持 SSE 流式返回进度
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ startDate: string; endDate: string }>(event);

  if (!body?.startDate || !body?.endDate) {
    throw createError({ statusCode: 400, message: '请提供 startDate 和 endDate' });
  }

  const db = useDB();
  const start = new Date(body.startDate);
  const end = new Date(body.endDate + 'T23:59:59');

  // 排除 rejected 状态，其他都向量化（accepted + pending）
  const articles = await db.query.articles.findMany({
    where: and(
      eq(schema.articles.vectorized, false),
      ne(schema.articles.filterStatus, 'rejected'),
      isNotNull(schema.articles.content),
      gte(schema.articles.publishedAt, start),
      lte(schema.articles.publishedAt, end),
    ),
  });

  if (!articles.length) {
    return { success: true, vectorized: 0, total: 0, message: '该日期范围内没有需要向量化的文章' };
  }

  console.log(`[Vectorize] 开始向量化 ${articles.length} 篇文章 (${body.startDate} ~ ${body.endDate})`);

  // SSE streaming
  const res = event.node.res;
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const sendEvent = (data: any) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  sendEvent({ type: 'start', total: articles.length });

  let vectorizedCount = 0;

  let clientDisconnected = false;
  res.on('close', () => { clientDisconnected = true; });

  for (let i = 0; i < articles.length; i++) {
    if (clientDisconnected) break;

    const article = articles[i];
    const text = article.content || `${article.title}\n${article.digest || ''}`;
    const chunks = splitIntoChunks(text);
    if (!chunks.length) {
      sendEvent({ type: 'progress', current: i + 1, total: articles.length, title: article.title, status: 'skipped' });
      continue;
    }

    console.log(`[Vectorize] (${i + 1}/${articles.length}) 处理: ${article.title} (${chunks.length} chunks)`);

    try {
      await db.delete(schema.articleChunks)
        .where(eq(schema.articleChunks.articleId, article.id));

      const embeddings = await generateEmbeddings(chunks);

      for (let j = 0; j < chunks.length; j++) {
        await db.insert(schema.articleChunks).values({
          articleId: article.id,
          chunkIndex: j,
          content: chunks[j],
          embedding: embeddings[j],
        });
      }

      await db.update(schema.articles)
        .set({ vectorized: true, updatedAt: new Date() })
        .where(eq(schema.articles.id, article.id));

      vectorizedCount++;
      sendEvent({ type: 'progress', current: i + 1, total: articles.length, title: article.title, status: 'success' });
    } catch (e: any) {
      console.error(`[Vectorize] 文章 ${article.id} 失败:`, e.message);
      sendEvent({ type: 'progress', current: i + 1, total: articles.length, title: article.title, status: 'failed', error: e.message });
    }
  }

  console.log(`[Vectorize] 完成: ${vectorizedCount}/${articles.length} 篇`);
  sendEvent({ type: 'done', vectorized: vectorizedCount, total: articles.length });

  res.end();
});
