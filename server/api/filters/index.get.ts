import { useDB, schema } from '~/server/db';

export default defineEventHandler(async () => {
  const db = useDB();
  const rules = await db.select().from(schema.filterRules);
  return { rules };
});
