import { useDB, schema } from '~/server/db';
import { eq } from 'drizzle-orm';
import { executeScrape } from '~/server/utils/scraper';

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * 简单的 cron 匹配器
 * 支持格式: "分 时 日 月 周" (标准5段)
 * 仅支持数字和 * 通配符
 */
function matchesCron(cron: string, date: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minute, hour, day, month, weekday] = parts;
  const checks = [
    { field: minute, value: date.getMinutes() },
    { field: hour, value: date.getHours() },
    { field: day, value: date.getDate() },
    { field: month, value: date.getMonth() + 1 },
    { field: weekday, value: date.getDay() },
  ];

  return checks.every(({ field, value }) => {
    if (field === '*') return true;
    // 支持逗号分隔的多个值
    const values = field.split(',').map(Number);
    return values.includes(value);
  });
}

/**
 * 每分钟检查一次是否有任务需要执行
 */
async function checkAndRun() {
  const now = new Date();

  try {
    const db = useDB();
    const sources = await db
      .select()
      .from(schema.scrapeSources)
      .where(eq(schema.scrapeSources.enabled, true));

    for (const source of sources) {
      if (!source.schedule) continue;
      if (!matchesCron(source.schedule, now)) continue;

      console.log(`[Scraper] 执行定时抓取: ${source.name}`);

      try {
        const result = await executeScrape({
          url: source.url,
          tableSelector: source.tableSelector,
          steps: source.steps,
          authConfig: source.authConfig,
        });

        if (result.success && result.data.length > 0) {
          await db.insert(schema.scrapedData).values({
            sourceId: source.id,
            data: result.data,
            columns: result.columns,
            rowCount: result.data.length,
          });

          await db
            .update(schema.scrapeSources)
            .set({ lastScrapedAt: new Date(), lastStatus: 'success', lastError: null })
            .where(eq(schema.scrapeSources.id, source.id));

          console.log(`[Scraper] ${source.name} 抓取成功，${result.data.length} 行`);
        } else {
          await db
            .update(schema.scrapeSources)
            .set({ lastScrapedAt: new Date(), lastStatus: 'failed', lastError: result.error })
            .where(eq(schema.scrapeSources.id, source.id));

          console.log(`[Scraper] ${source.name} 抓取失败: ${result.error}`);
        }
      } catch (err: any) {
        console.error(`[Scraper] ${source.name} 执行异常:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[Scraper] 调度检查失败:', err.message);
  }
}

export default defineNitroPlugin((nitro) => {
  // 每60秒检查一次（精度到分钟）
  intervalId = setInterval(checkAndRun, 60 * 1000);
  console.log('[Scraper] 定时调度器已启动');

  nitro.hooks.hook('close', () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  });
});
