import { eq } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

/**
 * PATCH /api/sources/:id/overseas
 * Toggle or set the isOverseas flag for a source.
 * Body: { isOverseas: boolean }
 */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'));
  const body = await readBody<{ isOverseas: boolean }>(event);

  if (typeof body?.isOverseas !== 'boolean') {
    throw createError({ statusCode: 400, message: '请提供 isOverseas 字段' });
  }

  const db = useDB();
  await db.update(schema.sources)
    .set({ isOverseas: body.isOverseas })
    .where(eq(schema.sources.id, id));

  return { success: true };
});
