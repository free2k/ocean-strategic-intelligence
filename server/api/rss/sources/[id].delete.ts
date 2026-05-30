import { eq } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

/**
 * DELETE /api/rss/sources/:id
 */
export default defineEventHandler(async (event) => {
  const id = Number(event.context.params?.id);
  if (!id) throw createError({ statusCode: 400, statusMessage: '无效 ID' });

  const db = useDB();
  await db.delete(schema.sources).where(eq(schema.sources.id, id));
  return { success: true };
});
