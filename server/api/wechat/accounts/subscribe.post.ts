import { eq } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

interface SubscribeBody {
  fakeid: string;
  nickname: string;
  avatar: string;
  alias?: string;
  serviceType?: number;
}

/**
 * POST /api/wechat/accounts/subscribe
 *
 * Subscribes to a WeChat official account by saving its info to the sources table.
 * If the fakeid already exists, returns the existing record without creating a duplicate.
 *
 * Body:
 * - fakeid (required): WeChat account unique identifier
 * - nickname (required): Account display name
 * - avatar (required): Account avatar URL (round_head_img)
 * - alias (optional): Account alias
 * - serviceType (optional): Account service type number
 *
 * Requirements: 2.2, 7.2
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<SubscribeBody>(event);

  // Validate required fields
  if (!body.fakeid || !body.nickname || !body.avatar) {
    throw createError({
      statusCode: 400,
      statusMessage: '缺少必填字段：fakeid、nickname、avatar',
    });
  }

  const db = useDB();

  // Check if the fakeid already exists to avoid duplicates
  const existing = await db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.fakeid, body.fakeid))
    .limit(1);

  if (existing.length > 0) {
    return {
      success: true,
      source: existing[0],
      created: false,
    };
  }

  // Insert new source record
  const [newSource] = await db
    .insert(schema.sources)
    .values({
      fakeid: body.fakeid,
      name: body.nickname,
      alias: body.alias || null,
      avatar: body.avatar,
      type: 'wechat',
    })
    .returning();

  return {
    success: true,
    source: newSource,
    created: true,
  };
});
