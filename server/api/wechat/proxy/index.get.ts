import { useDB, schema } from '~/server/db';

export default defineEventHandler(async () => {
  const db = useDB();
  const list = await db.select().from(schema.proxyNodes);
  return { list };
});
