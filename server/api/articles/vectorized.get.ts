import { desc, eq, like, sql, and, gte, inArray } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

function parseDateRange(range: string): Date | null {
  const now = new Date();
  switch (range) {
    case '3d': return new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    case '1w': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '2w': return new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    case '1m': return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case '3m': return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    case '6m': return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    case '1y': return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    default: return null;
  }
}

/** GET /api/articles/vectorized - 查询已向量化的文章列表 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20));
  const search = (query.search as string) || '';
  const sourceType = (query.sourceType as string) || '';
  const sourceId = query.sourceId ? Number(query.sourceId) : undefined;
  const dateRange = (query.dateRange as string) || '';
  const matchedTopic = (query.matchedTopic as string) || '';

  const db = useDB();
  const offset = (page - 1) * pageSize;

  const conditions = [eq(schema.articles.vectorized, true)];

  if (search) {
    conditions.push(like(schema.articles.title, `%${search}%`));
  }
  if (sourceType) {
    conditions.push(eq(schema.articles.sourceType, sourceType));
  }
  if (sourceId) {
    conditions.push(eq(schema.articles.sourceId, sourceId));
  }
  if (matchedTopic) {
    conditions.push(eq(schema.articles.matchedTopic, matchedTopic));
  }
  if (dateRange) {
    const since = parseDateRange(dateRange);
    if (since) {
      conditions.push(gte(schema.articles.publishedAt, since));
    }
  }

  const where = and(...conditions);

  const [articles, countResult] = await Promise.all([
    db.select({
      id: schema.articles.id,
      title: schema.articles.title,
      link: schema.articles.link,
      sourceType: schema.articles.sourceType,
      publishedAt: schema.articles.publishedAt,
      matchedTopic: schema.articles.matchedTopic,
      sourceName: schema.sources.name,
    })
      .from(schema.articles)
      .leftJoin(schema.sources, eq(schema.articles.sourceId, schema.sources.id))
      .where(where)
      .orderBy(desc(schema.articles.publishedAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` })
      .from(schema.articles)
      .where(where),
  ]);

  return {
    articles,
    total: Number(countResult[0]?.count || 0),
    page,
    pageSize,
  };
});
