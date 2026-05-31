import { useDB, schema } from '~/server/db';
import { eq } from 'drizzle-orm';
import { executeScrape } from '~/server/utils/scraper';

/** 手动触发抓取任务 */
export default defineEventHandler(async (event) => {
  const { sourceId } = await readBody(event);
  if (!sourceId) throw createError({ statusCode: 400, message: '缺少 sourceId' });

  const db = useDB();

  // 获取数据源配置
  const [source] = await db
    .select()
    .from(schema.scrapeSources)
    .where(eq(schema.scrapeSources.id, sourceId));

  if (!source) throw createError({ statusCode: 404, message: '数据源不存在' });

  // 执行抓取
  const result = await executeScrape({
    url: source.url,
    tableSelector: source.tableSelector,
    steps: source.steps,
    authConfig: source.authConfig,
  });

  if (result.success && result.data.length > 0) {
    // 存储抓取结果
    await db.insert(schema.scrapedData).values({
      sourceId: source.id,
      data: result.data,
      columns: result.columns,
      rowCount: result.data.length,
    });

    // 更新数据源状态
    await db
      .update(schema.scrapeSources)
      .set({
        lastScrapedAt: new Date(),
        lastStatus: 'success',
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.scrapeSources.id, sourceId));
  } else {
    // 更新失败状态
    await db
      .update(schema.scrapeSources)
      .set({
        lastScrapedAt: new Date(),
        lastStatus: 'failed',
        lastError: result.error || '未获取到数据',
        updatedAt: new Date(),
      })
      .where(eq(schema.scrapeSources.id, sourceId));
  }

  return {
    success: result.success,
    rowCount: result.data.length,
    columns: result.columns,
    error: result.error,
  };
});
