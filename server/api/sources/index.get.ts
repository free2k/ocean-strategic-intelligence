import { sql, eq } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

export default defineEventHandler(async () => {
  const db = useDB();

  // 先查所有来源
  const allSources = await db.select().from(schema.sources);

  // 再统计每个来源的文章数
  const counts = await db.select({
    sourceId: schema.articles.sourceId,
    count: sql<string>`count(*)`,
  })
    .from(schema.articles)
    .groupBy(schema.articles.sourceId);

  const countMap = new Map(counts.map(c => [c.sourceId, Number(c.count)]));

  const sources = allSources.map(s => ({
    id: s.id,
    fakeid: s.fakeid,
    name: s.name,
    alias: s.alias,
    type: s.type,
    createdAt: s.createdAt,
    articleCount: countMap.get(s.id) || 0,
  }));

  return { sources };
});
