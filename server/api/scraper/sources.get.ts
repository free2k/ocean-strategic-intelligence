import { useDB, schema } from '~/server/db';
import { desc, eq } from 'drizzle-orm';

/** 获取抓取数据源列表，支持按渠道过滤 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const channel = query.channel as string | undefined;

  const db = useDB();
  let q = db.select().from(schema.scrapeSources);

  if (channel) {
    q = q.where(eq(schema.scrapeSources.channel, channel)) as any;
  }

  const sources = await q.orderBy(desc(schema.scrapeSources.createdAt));
  return sources;
});
