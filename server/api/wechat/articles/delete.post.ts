import { inArray } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

interface DeleteBody {
  articleIds: number[];
}

/**
 * POST /api/wechat/articles/delete
 *
 * Deletes articles by their IDs. Also removes associated chunks.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<DeleteBody>(event);
  const { articleIds } = body;

  if (!articleIds || articleIds.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: '缺少 articleIds 参数',
    });
  }

  const db = useDB();

  // Delete associated chunks first
  await db
    .delete(schema.articleChunks)
    .where(inArray(schema.articleChunks.articleId, articleIds));

  // Delete articles
  const result = await db
    .delete(schema.articles)
    .where(inArray(schema.articles.id, articleIds));

  return {
    success: true,
    deleted: articleIds.length,
  };
});
