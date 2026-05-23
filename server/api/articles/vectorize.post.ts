import { eq, and } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { generateEmbeddings, splitIntoChunks } from '~/server/utils/embedding';

export default defineEventHandler(async (event) => {
  const body = await readBody<{ articleIds?: number[]; all?: boolean }>(event);
  const db = useDB();

  // 获取待向量化的文章（必须是 accepted 状态且未向量化）
  let articles;
  if (body?.articleIds?.length) {
    articles = await db.query.articles.findMany({
      where: and(
        eq(schema.articles.vectorized, false),
        eq(schema.articles.filterStatus, 'accepted'),
      ),
    });
    articles = articles.filter(a => body.articleIds!.includes(a.id));
  } else if (body?.all) {
    articles = await db.query.articles.findMany({
      where: and(
        eq(schema.articles.vectorized, false),
        eq(schema.articles.filterStatus, 'accepted'),
      ),
    });
  } else {
    throw createError({ statusCode: 400, message: '请指定 articleIds 或 all: true' });
  }

  if (!articles.length) {
    return { success: true, vectorized: 0, message: '没有需要向量化的文章' };
  }

  let vectorizedCount = 0;

  for (const article of articles) {
    const text = article.content || `${article.title}\n${article.digest || ''}`;
    const chunks = splitIntoChunks(text);

    if (!chunks.length) continue;

    try {
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
