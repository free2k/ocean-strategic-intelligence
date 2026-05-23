import { eq, inArray } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

/**
 * 移除文章的向量化数据（从知识库中去掉）
 * body: { articleIds: number[] }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ articleIds: number[] }>(event);

  if (!body?.articleIds?.length) {
    throw createError({ statusCode: 400, message: '请指定要移除的文章 ID' });
  }

  const db = useDB();

  // 删除对应的 chunks（向量数据）
  await db.delete(schema.articleChunks)
    .where(inArray(schema.articleChunks.articleId, body.articleIds));

  // 重置文章的 vectorized 状态
  await db.update(schema.articles)
    .set({ vectorized: false, updatedAt: new Date() })
    .where(inArray(schema.articles.id, body.articleIds));

  return { success: true, removed: body.articleIds.length };
});
