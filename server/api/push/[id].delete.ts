import { useDB, schema } from '~/server/db';
import { eq } from 'drizzle-orm';

/** 删除推送任务 */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'));
  if (!id) throw createError({ statusCode: 400, message: '无效的任务 ID' });

  const db = useDB();
  await db.delete(schema.pushTasks).where(eq(schema.pushTasks.id, id));

  return { success: true };
});
