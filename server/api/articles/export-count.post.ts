import { desc, eq, and, gte } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

function parseDateRange(range: string): Date | null {
  const now = new Date();
  switch (range) {
    case '1w': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '2w': return new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    case '1m': return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case '3m': return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    case '6m': return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    case '1y': return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    default: return null;
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    topic?: string;
    dateRange?: string;
    sourceType?: string;
    sourceId?: number;
    filterStatus?: string;
  }>(event);

  const db = useDB();
  const conditions = [];

  if (body?.topic) {
    conditions.push(eq(schema.articles.matchedTopic, body.topic));
  }
  if (body?.dateRange) {
    const since = parseDateRange(body.dateRange);
    if (since) conditions.push(gte(schema.articles.publishedAt, since));
  }
  if (body?.sourceType) {
    conditions.push(eq(schema.articles.sourceType, body.sourceType));
  }
  if (body?.sourceId) {
    conditions.push(eq(schema.articles.sourceId, body.sourceId));
  }
  if (body?.filterStatus) {
    conditions.push(eq(schema.articles.filterStatus, body.filterStatus));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const articles = await db.select({ id: schema.articles.id })
    .from(schema.articles)
    .where(where);

  return { count: articles.length };
});
