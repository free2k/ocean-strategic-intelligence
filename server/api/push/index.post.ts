import { useDB, schema } from '~/server/db';

/** 新增推送任务 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    email: string;
    frequency: string;
    dateRange?: string;
    topics?: string[];
  }>(event);

  if (!body?.email) {
    throw createError({ statusCode: 400, message: '邮箱地址不能为空' });
  }

  const db = useDB();
  const [task] = await db.insert(schema.pushTasks).values({
    email: body.email,
    frequency: body.frequency || 'weekly',
    dateRange: body.dateRange || '2w',
    topics: (body.topics || []).filter(Boolean),
  }).returning();

  return { task };
});
