import { useDB, schema } from '~/server/db';
import { eq } from 'drizzle-orm';

/** 获取单条抓取数据的完整内容 */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'));
  if (!id) throw createError({ statusCode: 400, message: '无效的 ID' });

  const db = useDB();
  const [data] = await db
    .select()
    .from(schema.scrapedData)
    .where(eq(schema.scrapedData.id, id));

  if (!data) throw createError({ statusCode: 404, message: '数据不存在' });
  return data;
});
