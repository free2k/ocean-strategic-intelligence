import { eq } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'));
  const body = await readBody<{
    url?: string;
    name?: string;
    authorization?: string;
    enabled?: boolean;
  }>(event);

  const db = useDB();
  const updates: Record<string, any> = {};

  if (body.url !== undefined) updates.url = body.url;
  if (body.name !== undefined) updates.name = body.name;
  if (body.authorization !== undefined) updates.authorization = body.authorization;
  if (body.enabled !== undefined) updates.enabled = body.enabled;

  const [proxy] = await db.update(schema.proxyNodes)
    .set(updates)
    .where(eq(schema.proxyNodes.id, id))
    .returning();

  return proxy;
});
