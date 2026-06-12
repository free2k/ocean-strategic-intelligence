import { eq, and, isNotNull } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { generateEmbeddings, splitIntoChunks } from '~/server/utils/embedding';

/**
 * POST /api/articles/vectorize-stream
 * SSE 流式向量化，实时返回进度
 * Body: { all?: boolean }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ all?: boolean; sourceId?: number }>(event).catch(() => ({} as { all?: boolean; sourceId?: number }));
  const db = useDB();

  // 查询待向量化的文章 ID（不加载 content）
  const conditions = [
    eq(schema.articles.vectorized, false),
    eq(schema.articles.filterStatus, 'accepted'),
    isNotNull(schema.articles.content),
  ];
  if (body?.sourceId) {
    conditions.push(eq(schema.articles.sourceId, body.sourceId));
  }
  const rows = await db.select({ id: schema.articles.id })
    .from(schema.articles)
    .where(and(...conditions));

  const articleIds = rows.map(r => r.id);

  // SSE 响应
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const res = event.node.res;
  const sendEvent = (data: any) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  if (!articleIds.length) {
    sendEvent({ type: 'done', vectorized: 0, total: 0 });
    res.end();
    return;
  }

  sendEvent({ type: 'start', total: articleIds.length });
  console.log(`[Vectorize] 开始向量化 ${articleIds.length} 篇文章`);

  let vectorized = 0;
  let clientDisconnected = false;

  // 监听客户端断开连接
  res.on('close', () => {
    clientDisconnected = true;
    console.log(`[Vectorize] ⚠️ 客户端取消，停止向量化 (已完成 ${vectorized}/${articleIds.length})`);
  });

  for (let i = 0; i < articleIds.length; i++) {
    // 客户端断开时停止处理
    if (clientDisconnected) {
      console.log(`[Vectorize] 中断: 在第 ${i + 1}/${articleIds.length} 篇时停止`);
      break;
    }
    const [article] = await db.select({
      id: schema.articles.id,
      title: schema.articles.title,
      content: schema.articles.content,
    }).from(schema.articles).where(eq(schema.articles.id, articleIds[i])).limit(1);

    if (!article?.content) continue;

    try {
      const chunks = splitIntoChunks(article.content);
      if (!chunks.length) continue;

      await db.delete(schema.articleChunks).where(eq(schema.articleChunks.articleId, article.id));
      const embeddings = await generateEmbeddings(chunks);

      // 再次检查取消（embedding 调用耗时较长）
      if (clientDisconnected) {
        console.log(`[Vectorize] 中断: embedding完成后检测到取消，丢弃 #${article.id}`);
        break;
      }

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

      vectorized++;
      sendEvent({ type: 'progress', current: vectorized, total: articleIds.length, title: article.title });
      console.log(`[Vectorize] ✅ ${vectorized}/${articleIds.length} #${article.id} "${article.title?.slice(0, 40)}"`);
    } catch (e: any) {
      console.error(`[VectorizeStream] 文章 ${article.id} 失败:`, e.message);
      sendEvent({ type: 'progress', current: i + 1, total: articleIds.length, title: `${article.title} (失败)` });
    }
  }

  if (!clientDisconnected) {
    sendEvent({ type: 'done', vectorized, total: articleIds.length });
  }
  console.log(`[Vectorize] ${clientDisconnected ? '已取消' : '完成'}: 成功 ${vectorized}/${articleIds.length}`);
  if (!res.writableEnded) res.end();
});
