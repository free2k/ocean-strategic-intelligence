import { eq, and, isNotNull, inArray } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { generateEmbeddings, splitIntoChunks } from '~/server/utils/embedding';

export default defineEventHandler(async (event) => {
  const body = await readBody<{ articleIds?: number[]; all?: boolean }>(event);
  const db = useDB();

  // 获取待向量化的文章 ID 列表（不加载 content）
  let articleIds: number[];
  if (body?.articleIds?.length) {
    articleIds = body.articleIds;
  } else if (body?.all) {
    const rows = await db.select({ id: schema.articles.id })
      .from(schema.articles)
      .where(and(
        eq(schema.articles.vectorized, false),
        eq(schema.articles.filterStatus, 'accepted'),
        isNotNull(schema.articles.content),
      ));
    articleIds = rows.map(r => r.id);
  } else {
    throw createError({ statusCode: 400, message: '请指定 articleIds 或 all: true' });
  }

  if (!articleIds.length) {
    return { success: true, vectorized: 0, total: 0, message: '没有需要向量化的文章' };
  }

  let vectorizedCount = 0;

  // 逐篇处理，避免一次性加载所有 content 导致 OOM
  for (const articleId of articleIds) {
    const [article] = await db.select({
      id: schema.articles.id,
      title: schema.articles.title,
      digest: schema.articles.digest,
      content: schema.articles.content,
      vectorized: schema.articles.vectorized,
    }).from(schema.articles).where(eq(schema.articles.id, articleId)).limit(1);

    if (!article || article.vectorized || !article.content) continue;

    const text = article.content || `${article.title}\n${article.digest || ''}`;
    const chunks = splitIntoChunks(text);

    if (!chunks.length) continue;

    try {
      // 幂等：先删除该文章已有的 chunks
      await db.delete(schema.articleChunks)
        .where(eq(schema.articleChunks.articleId, article.id));

      const embeddings = await generateEmbeddings(chunks);

      for (let i = 0; i < chunks.length; i++) {
        await db.insert(schema.articleChunks).values({
          articleId: article.id,
          chunkIndex: i,
          content: chunks[i],
          embedding: embeddings[i],
        });
      }

      await db.update(schema.articles)
        .set({ vectorized: true, updatedAt: new Date() })
        .where(eq(schema.articles.id, article.id));

      vectorizedCount++;
    } catch (e: any) {
      console.error(`向量化文章 ${article.id} 失败:`, e.message);
    }
  }

  return { success: true, vectorized: vectorizedCount, total: articleIds.length };
});
