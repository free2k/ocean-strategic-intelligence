import { useDB, schema } from '~/server/db';
import { sql, eq } from 'drizzle-orm';

/** GET /api/scraper/channels - 获取所有渠道及其数据源数量 */
export default defineEventHandler(async () => {
  const db = useDB();

  const channels = await db
    .select({
      channel: schema.scrapeSources.channel,
      count: sql<number>`count(*)::int`,
      lastScrapedAt: sql<string | null>`max(${schema.scrapeSources.lastScrapedAt})`,
    })
    .from(schema.scrapeSources)
    .groupBy(schema.scrapeSources.channel)
    .orderBy(schema.scrapeSources.channel);

  return channels;
});
