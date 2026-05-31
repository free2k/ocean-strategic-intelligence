import { useDB, schema } from '~/server/db';
import { eq, desc } from 'drizzle-orm';

/** 获取指定数据源的抓取数据（最新一条或全部历史） */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const sourceId = Number(query.sourceId);
  const latest = query.latest === 'true';
  const limit = Number(query.limit) || 20;

  if (!sourceId) throw createError({ statusCode: 400, message: '缺少 sourceId' });

  const db = useDB();

  if (latest) {
    // 只返回最新一条
    const [data] = await db
      .select()
      .from(schema.scrapedData)
      .where(eq(schema.scrapedData.sourceId, sourceId))
      .orderBy(desc(schema.scrapedData.scrapedAt))
      .limit(1);
    return data || null;
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
