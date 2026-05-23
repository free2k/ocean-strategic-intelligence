import { desc, eq, like, sql, and } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20));
  const search = (query.search as string) || '';
  const sourceId = query.sourceId ? Number(query.sourceId) : undefined;
  const sourceType = (query.sourceType as string) || '';
  const filterStatus = (query.filterStatus as string) || '';

  const db = useDB();
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (search) {
    conditions.push(like(schema.articles.title, `%${search}%`));
  }
  if (sourceId) {
    conditions.push(eq(schema.articles.sourceId, sourceId));
  }
  if (sourceType) {
    conditions.push(eq(schema.articles.sourceType, sourceType));
  }
  if (filterStatus) {
    conditions.push(eq(schema.articles.filterStatus, filterStatus));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [articles, countResult] = await Promise.all([
    db.select({
      id: schema.articles.id,
      title: schema.articles.title,
      link: schema.articles.link,
      cover: schema.articles.cover,
      digest: schema.articles.digest,
      authorName: schema.articles.authorName,
      sourceType: schema.articles.sourceType,
      publishedAt: schema.articles.publishedAt,
      createdAt: schema.articles.createdAt,
      vectorized: schema.articles.vectorized,
      filterStatus: schema.articles.filterStatus,
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
