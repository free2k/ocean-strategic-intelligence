import { eq } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

interface UpdateBody {
  name?: string;
  url?: string;
}

/**
 * PATCH /api/rss/sources/:id
 * Update RSS source name or URL.
 */
export default defineEventHandler(async (event) => {
  const id = Number(event.context.params?.id);
  if (!id) throw createError({ statusCode: 400, statusMessage: '无效 ID' });

  const body = await readBody<UpdateBody>(event);
  const db = useDB();

  const updateData: Record<string, any> = {};
  if (body.name?.trim()) updateData.name = body.name.trim();
  if (body.url?.trim()) updateData.alias = body.url.trim();

  if (Object.keys(updateData).length === 0) {
    throw createError({ statusCode: 400, statusMessage: '没有需要更新的字段' });
  }

  await db.update(schema.sources).set(updateData).where(eq(schema.sources.id, id));
  return { success: true };
});
