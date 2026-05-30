import { eq } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'));
  const db = useDB();

  // First delete all articles associated with this source
  await db.delete(schema.articles).where(eq(schema.articles.sourceId, id));

  // Then delete the source record itself
  await db.delete(schema.sources).where(eq(schema.sources.id, id));

  return { success: true };
});
