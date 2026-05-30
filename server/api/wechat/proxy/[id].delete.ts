import { eq } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'));
  const db = useDB();

  await db.delete(schema.proxyNodes).where(eq(schema.proxyNodes.id, id));
  return { success: true };
});
