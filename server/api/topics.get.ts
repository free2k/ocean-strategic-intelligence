import { sql, eq, and, isNotNull } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

/** 获取所有已有文章的行业主题列表 */
export default defineEventHandler(async () => {
  const db = useDB();

  const results = await db.select({
    topic: schema.articles.matchedTopic,
    count: sql<number>`count(*)`,
  })
    .from(schema.articles)
    .where(and(
      isNotNull(schema.articles.matchedTopic),
      eq(schema.articles.filterStatus, 'accepted'),
    ))
    .groupBy(schema.articles.matchedTopic);

  return {
    topics: results.map(r => ({
      name: r.topic,
      articleCount: Number(r.count),
    })),
  };
});
