import { desc, eq, and, gte, inArray, sql } from 'drizzle-orm';
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

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    topic?: string;
    dateRange?: string;
    sourceType?: string;
    sourceId?: number;
    filterStatus?: string;
    overseas?: string;
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
  if (body?.overseas === 'true' || body?.overseas === 'false') {
    const overseasSources = await db.select({ id: schema.sources.id })
      .from(schema.sources)
      .where(eq(schema.sources.isOverseas, body.overseas === 'true'));
    const ids = overseasSources.map(s => s.id);
    if (ids.length > 0) {
      conditions.push(inArray(schema.articles.sourceId, ids));
    } else if (body.overseas === 'true') {
      return { count: 0 };
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [result] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.articles)
    .where(where);

  return { count: Number(result.count) };
});
