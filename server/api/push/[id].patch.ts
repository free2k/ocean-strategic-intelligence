import { useDB, schema } from '~/server/db';
import { eq } from 'drizzle-orm';

/** 更新推送任务 */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'));
  if (!id) throw createError({ statusCode: 400, message: '无效的任务 ID' });

  const body = await readBody<{
    enabled?: boolean;
    email?: string;
    frequency?: string;
    dateRange?: string;
    topics?: string[];
  }>(event);

  const db = useDB();
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.email) updates.email = body.email;
  if (body.frequency) updates.frequency = body.frequency;
  if (body.dateRange) updates.dateRange = body.dateRange;
  if (body.topics !== undefined) updates.topics = body.topics;

  const [task] = await db.update(schema.pushTasks)
    .set(updates)
    .where(eq(schema.pushTasks.id, id))
    .returning();

  return { task };
});
