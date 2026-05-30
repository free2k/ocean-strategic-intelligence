import { sql, eq, and, isNotNull, inArray } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

/** 获取所有已有文章的行业主题列表，支持按国内/外网筛选 */
export default defineEventHandler(async (event) => {
  const db = useDB();
  const query = getQuery(event);
  const overseas = (query.overseas as string) || '';

  // 构建额外的来源筛选条件
  const extraConditions = [];
  if (overseas === 'true' || overseas === 'false') {
    const filteredSources = await db.select({ id: schema.sources.id })
      .from(schema.sources)
      .where(eq(schema.sources.isOverseas, overseas === 'true'));
    const ids = filteredSources.map(s => s.id);
    if (ids.length > 0) {
      extraConditions.push(inArray(schema.articles.sourceId, ids));
    } else {
      // 没有匹配的来源，返回空
      return { topics: [] };
    }
  }

  const results = await db.select({
    topic: schema.articles.matchedTopic,
    count: sql<number>`count(*)`,
  })
    .from(schema.articles)
    .where(and(
      isNotNull(schema.articles.matchedTopic),
      eq(schema.articles.filterStatus, 'accepted'),
      ...extraConditions,
    ))
    .groupBy(schema.articles.matchedTopic);

  const topics = results.map(r => ({
    name: r.topic,
    articleCount: Number(r.count),
  }));

  return { topics };
});
