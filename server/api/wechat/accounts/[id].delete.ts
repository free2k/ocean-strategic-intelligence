import { eq, inArray } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'));
  const db = useDB();

  // 查出该公众号的所有文章 ID
  const articles = await db.select({ id: schema.articles.id })
    .from(schema.articles)
    .where(eq(schema.articles.sourceId, id));
  const articleIds = articles.map(a => a.id);

  // 删除向量化数据（article_chunks）
  if (articleIds.length > 0) {
    await db.delete(schema.articleChunks).where(inArray(schema.articleChunks.articleId, articleIds));
  }

  // 删除文章
  await db.delete(schema.articles).where(eq(schema.articles.sourceId, id));

  // 删除公众号记录
  await db.delete(schema.sources).where(eq(schema.sources.id, id));

  console.log(`[Delete] 已删除公众号 #${id}，关联文章 ${articleIds.length} 篇及其向量数据`);
  return { success: true, deletedArticles: articleIds.length };
});
