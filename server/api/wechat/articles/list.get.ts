import { eq, like, and, count, desc, gte, lte, inArray, SQL } from 'drizzle-orm';
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
 * Queries the local articles table with pagination and optional filters.
 *
 * Query params:
 * - sourceId (optional): Filter articles by source ID (supports comma-separated for multiple). If omitted, returns all.
 * - page (optional): Page number, default 1
 * - pageSize (optional): Items per page, default 20
 * - keyword (optional): Search keyword to filter by title
 * - startDate (optional): Filter articles published on or after this date (ISO string or YYYY-MM-DD)
 * - endDate (optional): Filter articles published on or before this date (ISO string or YYYY-MM-DD)
 */
export default defineEventHandler(async (event): Promise<ArticleListResponse> => {
  const query = getQuery(event);

  // Support comma-separated sourceIds for multi-account selection (optional)
  const sourceIdParam = (query.sourceId as string)?.trim() || '';
  const sourceIds = sourceIdParam
    ? sourceIdParam.split(',').map(Number).filter((id) => !isNaN(id) && id > 0)
    : [];

  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  const keyword = (query.keyword as string)?.trim() || '';
  const startDate = (query.startDate as string)?.trim() || '';
  const endDate = (query.endDate as string)?.trim() || '';

  const db = useDB();

  // Build filter conditions
  const conditions: SQL[] = [];

  // Only filter by source if specified
  if (sourceIds.length === 1) {
    conditions.push(eq(schema.articles.sourceId, sourceIds[0]));
  } else if (sourceIds.length > 1) {
    conditions.push(inArray(schema.articles.sourceId, sourceIds));
  }

  // Only include wechat source type articles
  conditions.push(eq(schema.articles.sourceType, 'wechat'));

  if (keyword) {
    conditions.push(like(schema.articles.title, `%${keyword}%`));
  }

  // Date range filters
  if (startDate) {
    const start = new Date(startDate);
    if (!isNaN(start.getTime())) {
      conditions.push(gte(schema.articles.publishedAt, start));
    }
  }
  if (endDate) {
    const end = new Date(endDate);
    if (!isNaN(end.getTime())) {
      // Set to end of day to include the entire end date
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(schema.articles.publishedAt, end));
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions)! : undefined;

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
