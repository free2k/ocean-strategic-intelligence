import { useDB, schema } from '~/server/db';
import { eq } from 'drizzle-orm';

/** 删除抓取数据源及其关联数据 */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'));
  if (!id) throw createError({ statusCode: 400, message: '无效的 ID' });

  const db = useDB();

  // 先删除关联的抓取数据
  await db.delete(schema.scrapedData).where(eq(schema.scrapedData.sourceId, id));
  // 再删除数据源
  const [deleted] = await db
    .delete(schema.scrapeSources)
    .where(eq(schema.scrapeSources.id, id))
    .returning();

  if (!deleted) throw createError({ statusCode: 404, message: '数据源不存在' });
  return { success: true };
});
