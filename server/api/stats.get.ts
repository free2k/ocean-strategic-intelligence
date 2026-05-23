import { sql, eq } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

export default defineEventHandler(async () => {
  const db = useDB();

  const [articleCount] = await db.select({ count: sql<number>`count(*)` }).from(schema.articles);
  const [vectorizedCount] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.articles)
    .where(eq(schema.articles.vectorized, true));
  const [sourceCount] = await db.select({ count: sql<number>`count(*)` }).from(schema.sources);
  const [chunkCount] = await db.select({ count: sql<number>`count(*)` }).from(schema.articleChunks);

  return {
    totalArticles: Number(articleCount.count),
    vectorizedArticles: Number(vectorizedCount.count),
    totalSources: Number(sourceCount.count),
    totalChunks: Number(chunkCount.count),
  };
});
