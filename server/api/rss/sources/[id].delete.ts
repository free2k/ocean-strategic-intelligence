import { eq, inArray } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

/**
 * DELETE /api/rss/sources/:id
 *
 * 删除订阅源及其关联的所有文章和向量数据
 */
export default defineEventHandler(async (event) => {
  const id = Number(event.context.params?.id);
  if (!id) throw createError({ statusCode: 400, statusMessage: '无效 ID' });

  const db = useDB();

  // 1. 查找该来源下的所有文章 ID
  const articles = await db
    .select({ id: schema.articles.id })
    .from(schema.articles)
    .where(eq(schema.articles.sourceId, id));

  const articleIds = articles.map((a) => a.id);

  // 2. 删除文章关联的向量块
  if (articleIds.length > 0) {
    await db
      .delete(schema.articleChunks)
      .where(inArray(schema.articleChunks.articleId, articleIds));
  }

  // 3. 删除文章
  await db.delete(schema.articles).where(eq(schema.articles.sourceId, id));

  // 4. 删除订阅源
  await db.delete(schema.sources).where(eq(schema.sources.id, id));

  return { success: true, deletedArticles: articleIds.length };
});
