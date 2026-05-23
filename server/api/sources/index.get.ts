import { sql } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

export default defineEventHandler(async () => {
  const db = useDB();

  const sources = await db.select({
    id: schema.sources.id,
    fakeid: schema.sources.fakeid,
    name: schema.sources.name,
    alias: schema.sources.alias,
    type: schema.sources.type,
    createdAt: schema.sources.createdAt,
    articleCount: sql<number>`(SELECT count(*) FROM articles WHERE source_id = ${schema.sources.id})`,
  }).from(schema.sources);

  return { sources };
});
