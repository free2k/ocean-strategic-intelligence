import { eq } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

/**
 * GET /api/rss/sources
 * Returns all RSS source records.
 */
export default defineEventHandler(async () => {
  const db = useDB();
  const list = await db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.type, 'rss'));

  return { list };
});
