import { useDB, schema } from '~/server/db';
import { desc } from 'drizzle-orm';

/** 获取所有推送任务 */
export default defineEventHandler(async () => {
  const db = useDB();
  const tasks = await db.select().from(schema.pushTasks).orderBy(desc(schema.pushTasks.createdAt));
  return { tasks };
});
