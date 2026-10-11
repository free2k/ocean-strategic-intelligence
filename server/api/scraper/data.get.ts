import { useDB, schema } from '~/server/db';
import { eq, desc } from 'drizzle-orm';

/** 获取指定数据源的抓取数据（最新一条或全部历史） */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const sourceId = Number(query.sourceId);
  const latest = query.latest === 'true';
  const limit = Number(query.limit) || 20;
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || 200;

  if (!sourceId) throw createError({ statusCode: 400, message: '缺少 sourceId' });

  const db = useDB();

  if (latest) {
    // 只返回最新一条，支持分页返回 data 行
    const [record] = await db
      .select()
      .from(schema.scrapedData)
      .where(eq(schema.scrapedData.sourceId, sourceId))
      .orderBy(desc(schema.scrapedData.scrapedAt))
      .limit(1);

    if (!record) return null;

    // 对 data 进行分页切片
    const allData = record.data as Record<string, any>[];
    const totalRows = allData.length;
    const offset = (page - 1) * pageSize;
    const pagedData = allData.slice(offset, offset + pageSize);

    return {
      id: record.id,
      columns: record.columns,
      rowCount: totalRows,
      scrapedAt: record.scrapedAt,
      data: pagedData,
      page,
      pageSize,
      totalPages: Math.ceil(totalRows / pageSize),
    };
  }

  // 返回历史记录列表（不含完整 data 字段，减少传输量）
  const records = await db
    .select({
      id: schema.scrapedData.id,
      sourceId: schema.scrapedData.sourceId,
      columns: schema.scrapedData.columns,
      rowCount: schema.scrapedData.rowCount,
      scrapedAt: schema.scrapedData.scrapedAt,
    })
    .from(schema.scrapedData)
    .where(eq(schema.scrapedData.sourceId, sourceId))
    .orderBy(desc(schema.scrapedData.scrapedAt))
    .limit(limit);

  return records;
});
