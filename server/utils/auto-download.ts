import { inArray } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { articleDownloader } from '~/server/utils/wechat/article-downloader';

/**
 * 自动下载指定文章列表中缺失正文的文章。
 * 下载失败的文章会被标记为 pending（待筛选），从已分类列表中移出。
 * 返回成功下载的文章 ID 列表和失败的 ID 列表。
 */
export async function autoDownloadMissingContent(
  articleIds: number[],
  onProgress?: (progress: { completed: number; failed: number; total: number }) => void,
): Promise<{
  downloaded: number[];
  failed: number[];
}> {
  const db = useDB();

  // 找出需要下载的文章（排除已成功下载的）
  const articles = await db.query.articles.findMany({
    where: inArray(schema.articles.id, articleIds),
    columns: { id: true, link: true, downloadStatus: true },
  });

  // 只下载未下载或之前失败的
  const toDownload = articles.filter(a => a.downloadStatus !== 'downloaded');

  if (toDownload.length === 0) {
    console.log(`[AutoDownload] 所有 ${articles.length} 篇文章已下载，无需重复下载`);
    return { downloaded: [], failed: [] };
  }

  // 统计各状态分布
  const statusCount = articles.reduce((acc, a) => {
    acc[a.downloadStatus || 'null'] = (acc[a.downloadStatus || 'null'] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log(`[AutoDownload] 文章下载状态分布: ${JSON.stringify(statusCount)}`);
  console.log(`[AutoDownload] 开始自动下载 ${toDownload.length} 篇缺失正文的文章（共传入 ${articleIds.length} 篇）`);

  const downloaded: number[] = [];
  const failed: number[] = [];

  // 使用 articleDownloader 批量下载
  await articleDownloader.start(toDownload.map(a => a.id), 3, (event) => {
    if (event.type === 'completed') {
      downloaded.push(event.articleId);
      onProgress?.({ completed: downloaded.length + failed.length, failed: failed.length, total: toDownload.length });
    } else if (event.type === 'failed' || event.type === 'deleted') {
      failed.push(event.articleId);
      onProgress?.({ completed: downloaded.length + failed.length, failed: failed.length, total: toDownload.length });
    }
  });

  // 下载失败的文章标记为 pending（从已分类移出）
  if (failed.length > 0) {
    await db.update(schema.articles)
      .set({
        filterStatus: 'pending',
        matchedTopic: null,
        classifyMethod: null,
        updatedAt: new Date(),
      })
      .where(inArray(schema.articles.id, failed));
    console.log(`[AutoDownload] ${failed.length} 篇下载失败，已标记为待筛选`);
  }

  console.log(`[AutoDownload] 完成: 成功=${downloaded.length}, 失败=${failed.length}`);
  return { downloaded, failed };
}
