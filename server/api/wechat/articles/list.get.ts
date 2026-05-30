import { eq, like, and, count, desc, SQL } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

interface ArticleListItem {
  id: number;
  title: string;
  link: string;
  cover: string | null;
  digest: string | null;
  authorName: string | null;
  sourceId: number | null;
  publishedAt: Date;
  downloadStatus: string;
  createdAt: Date;
}

interface ArticleListResponse {
  list: ArticleListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * GET /api/wechat/articles/list
 *
 * Queries the local articles table with pagination and optional keyword search.
 *
 * Query params:
 * - sourceId (required): Filter articles by source ID
 * - page (optional): Page number, default 1
 * - pageSize (optional): Items per page, default 20
 * - keyword (optional): Search keyword to filter by title
 *
 * Requirements: 3.6
 */
export default defineEventHandler(async (event): Promise<ArticleListResponse> => {
  const query = getQuery(event);

  const sourceId = Number(query.sourceId);
  if (!sourceId || isNaN(sourceId)) {
    throw createError({
      statusCode: 400,
      statusMessage: '缺少必填参数：sourceId',
    });
  }

  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  const keyword = (query.keyword as string)?.trim() || '';

  const db = useDB();

  // Build filter conditions
  const conditions: SQL[] = [eq(schema.articles.sourceId, sourceId)];
  if (keyword) {
    conditions.push(like(schema.articles.title, `%${keyword}%`));
  }

  const whereClause = and(...conditions)!;

  // Get total count
  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.articles)
    .where(whereClause);

  // Get paginated list
  const offset = (page - 1) * pageSize;
  const list = await db
    .select({
      id: schema.articles.id,
      title: schema.articles.title,
      link: schema.articles.link,
      cover: schema.articles.cover,
      digest: schema.articles.digest,
      authorName: schema.articles.authorName,
      sourceId: schema.articles.sourceId,
      publishedAt: schema.articles.publishedAt,
      downloadStatus: schema.articles.downloadStatus,
      createdAt: schema.articles.createdAt,
    })
    .from(schema.articles)
    .where(whereClause)
    .orderBy(desc(schema.articles.publishedAt))
    .limit(pageSize)
    .offset(offset);

  return {
    list,
    total: Number(total),
    page,
    pageSize,
  };
});
