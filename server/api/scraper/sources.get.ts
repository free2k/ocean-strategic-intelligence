import { useDB, schema } from '~/server/db';
import { desc } from 'drizzle-orm';

/** 获取所有抓取数据源列表 */
export default defineEventHandler(async () => {
  const db = useDB();
  const sources = await db
    .select()
    .from(schema.scrapeSources)
    .orderBy(desc(schema.scrapeSources.createdAt));
  return sources;
});
