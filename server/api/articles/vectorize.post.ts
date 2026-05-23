import { eq, and, isNotNull } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { generateEmbeddings, splitIntoChunks } from '~/server/utils/embedding';

export default defineEventHandler(async (event) => {
  const body = await readBody<{ articleIds?: number[]; all?: boolean }>(event);
  const db = useDB();

  // 获取待向量化的文章
  let articles;
  if (body?.articleIds?.length) {
    // 指定 ID 时不限制 filterStatus，允许手动向量化任意文章
    articles = await db.query.articles.findMany({
      where: and(
        eq(schema.articles.vectorized, false),
        isNotNull(schema.articles.content),
      ),
    });
    articles = articles.filter(a => body.articleIds!.includes(a.id));
  } else if (body?.all) {
    // 批量向量化：处理有正文且未向量化的文章（accepted 状态）
    articles = await db.query.articles.findMany({
      where: and(
        eq(schema.articles.vectorized, false),
        eq(schema.articles.filterStatus, 'accepted'),
        isNotNull(schema.articles.content),
      ),
    });
  } else {
    throw createError({ statusCode: 400, message: '请指定 articleIds 或 all: true' });
  }

  if (!articles.length) {
    return { success: true, vectorized: 0, total: 0, message: '没有需要向量化的文章' };
  }

  let vectorizedCount = 0;

  for (const article of articles) {
    const text = article.content || `${article.title}\n${article.digest || ''}`;
    const chunks = splitIntoChunks(text);

    if (!chunks.length) continue;

    try {
      // 幂等：先删除该文章已有的 chunks，避免重复插入
      await db.delete(schema.articleChunks)
        .where(eq(schema.articleChunks.articleId, article.id));

      const embeddings = await generateEmbeddings(chunks);

      // 存储 chunks 和向量
      for (let i = 0; i < chunks.length; i++) {
        await db.insert(schema.articleChunks).values({
          articleId: article.id,
          chunkIndex: i,
          content: chunks[i],
          embedding: embeddings[i],
        });
      }

      // 标记文章已向量化
      await db.update(schema.articles)
        .set({ vectorized: true, updatedAt: new Date() })
        .where(eq(schema.articles.id, article.id));

      vectorizedCount++;
    } catch (e: any) {
      console.error(`向量化文章 ${article.id} 失败:`, e.message);
    }
  }

  return { success: true, vectorized: vectorizedCount, total: articles.length };
});
