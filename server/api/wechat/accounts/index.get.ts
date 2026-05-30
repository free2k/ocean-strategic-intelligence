import { eq, count, max } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

interface AccountWithStats {
  id: number;
  fakeid: string | null;
  name: string;
  alias: string | null;
  avatar: string | null;
  type: string;
  createdAt: Date;
  articleCount: number;
  lastSyncTime: Date | null;
}

/**
 * GET /api/wechat/accounts
 *
 * Returns all subscribed WeChat official accounts (type='wechat') from the sources table,
 * including the article count and last sync time for each account.
 *
 * Requirements: 2.3
 */
export default defineEventHandler(async (): Promise<{ list: AccountWithStats[] }> => {
  const db = useDB();

  const results = await db
    .select({
      id: schema.sources.id,
      fakeid: schema.sources.fakeid,
      name: schema.sources.name,
      alias: schema.sources.alias,
      avatar: schema.sources.avatar,
      type: schema.sources.type,
      createdAt: schema.sources.createdAt,
      articleCount: count(schema.articles.id),
      lastSyncTime: max(schema.articles.publishedAt),
    })
    .from(schema.sources)
    .leftJoin(schema.articles, eq(schema.sources.id, schema.articles.sourceId))
    .where(eq(schema.sources.type, 'wechat'))
    .groupBy(schema.sources.id);

  const list: AccountWithStats[] = results.map((row) => ({
    id: row.id,
    fakeid: row.fakeid,
    name: row.name,
    alias: row.alias,
    avatar: row.avatar,
    type: row.type,
    createdAt: row.createdAt,
    articleCount: Number(row.articleCount),
    lastSyncTime: row.lastSyncTime,
  }));

  return { list };
});
