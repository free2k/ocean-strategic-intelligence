import { sql, eq, and, isNotNull, inArray, gte } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

/** 获取所有已有文章的行业主题列表，支持按国内/外网和渠道类型筛选 */
export default defineEventHandler(async (event) => {
  const db = useDB();
  const query = getQuery(event);
  const overseas = (query.overseas as string) || '';
  const sourceType = (query.sourceType as string) || '';
  const sourceId = (query.sourceId as string) || '';
  const dateRange = (query.dateRange as string) || '';

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
      return { topics: [] };
    }
  }

  // 按渠道类型筛选
  if (sourceType) {
    extraConditions.push(eq(schema.articles.sourceType, sourceType));
  }

  // 按具体来源筛选
  if (sourceId) {
    extraConditions.push(eq(schema.articles.sourceId, Number(sourceId)));
  }

  // 按时间范围筛选
  if (dateRange) {
    const now = new Date();
    let since: Date | null = null;
    switch (dateRange) {
      case '3d': since = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); break;
      case '1w': since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
      case '2w': since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); break;
      case '1m': since = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()); break;
      case '3m': since = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()); break;
      case '6m': since = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()); break;
      case '1y': since = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); break;
    }
    if (since) extraConditions.push(gte(schema.articles.publishedAt, since));
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
