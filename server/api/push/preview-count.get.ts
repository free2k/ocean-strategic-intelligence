import { eq, and, gte, inArray, sql, isNotNull, or } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

/** 根据筛选条件返回可推送文章数量（排除无正文内容的） */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const dateRange = (query.dateRange as string) || '2w';
  const topicsParam = (query.topics as string) || '';

  const db = useDB();
  const conditions = [];

  // 只统计已通过的文章
  conditions.push(eq(schema.articles.filterStatus, 'accepted'));

  // 排除无内容的文章
  conditions.push(or(
    isNotNull(schema.articles.content),
    isNotNull(schema.articles.digest),
    isNotNull(schema.articles.summary),
  )!);

  // 时间范围
  const now = new Date();
  let since: Date | null = null;
  switch (dateRange) {
    case '3d': since = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); break;
    case '1w': since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
    case '2w': since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); break;
    case '1m': since = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()); break;
  }
  if (since) conditions.push(gte(schema.articles.publishedAt, since));

  // 行业筛选
  const topics = topicsParam ? topicsParam.split(',').filter(Boolean) : [];
  if (topics.length > 0) {
    conditions.push(inArray(schema.articles.matchedTopic, topics));
  }

  const [result] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.articles)
    .where(and(...conditions));

  return { count: Number(result.count) };
});
