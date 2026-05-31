import { sql, eq, and, isNotNull, inArray } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

/**
 * GET /api/stats/categories
 *
 * Returns article count grouped by matchedTopic, split into domestic and overseas.
 * Used for the homepage dashboard charts.
 */
export default defineEventHandler(async () => {
  const db = useDB();

  // Get overseas source IDs
  const overseasSources = await db.select({ id: schema.sources.id })
    .from(schema.sources)
    .where(eq(schema.sources.isOverseas, true));
  const overseasIds = overseasSources.map(s => s.id);

  const domesticSources = await db.select({ id: schema.sources.id })
    .from(schema.sources)
    .where(eq(schema.sources.isOverseas, false));
  const domesticIds = domesticSources.map(s => s.id);

  // Domestic categories
  let domestic: { name: string; count: number }[] = [];
  if (domesticIds.length > 0) {
    const domesticResults = await db.select({
      topic: schema.articles.matchedTopic,
      count: sql<number>`count(*)`,
    })
      .from(schema.articles)
      .where(and(
        isNotNull(schema.articles.matchedTopic),
        eq(schema.articles.filterStatus, 'accepted'),
        inArray(schema.articles.sourceId, domesticIds),
      ))
      .groupBy(schema.articles.matchedTopic);

    domestic = domesticResults.map(r => ({
      name: r.topic!,
      count: Number(r.count),
    }));
  }

  // Overseas categories
  let overseas: { name: string; count: number }[] = [];
  if (overseasIds.length > 0) {
    const overseasResults = await db.select({
      topic: schema.articles.matchedTopic,
      count: sql<number>`count(*)`,
    })
      .from(schema.articles)
      .where(and(
        isNotNull(schema.articles.matchedTopic),
        eq(schema.articles.filterStatus, 'accepted'),
        inArray(schema.articles.sourceId, overseasIds),
      ))
      .groupBy(schema.articles.matchedTopic);

    overseas = overseasResults.map(r => ({
      name: r.topic!,
      count: Number(r.count),
    }));
  }

  return { domestic, overseas };
});
