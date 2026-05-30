import { eq } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

interface AddSourceBody {
  name: string;
  url: string;
}

/**
 * POST /api/rss/sources
 * Add a new RSS source (name + feed URL).
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<AddSourceBody>(event);

  if (!body?.name?.trim() || !body?.url?.trim()) {
    throw createError({ statusCode: 400, statusMessage: '请填写 RSS 名称和地址' });
  }

  const db = useDB();
  const fakeid = `rss_${body.url.replace(/[^a-z0-9]/gi, '_').substring(0, 60)}`;

  // Check duplicate
  const existing = await db.select().from(schema.sources).where(eq(schema.sources.fakeid, fakeid)).limit(1);
  if (existing.length > 0) {
    return { success: true, source: existing[0], created: false };
  }

  const [source] = await db.insert(schema.sources).values({
    fakeid,
    name: body.name.trim(),
    alias: body.url.trim(),
    type: 'rss',
  }).returning();

  return { success: true, source, created: true };
});
