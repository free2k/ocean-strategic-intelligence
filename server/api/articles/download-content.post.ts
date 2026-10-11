import { articleDownloader } from '~/server/utils/wechat/article-downloader';

/**
 * 下载单篇文章正文内容
 * body: { articleId: number }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ articleId: number }>(event);

  if (!body?.articleId) {
    throw createError({ statusCode: 400, message: '请提供 articleId' });
  }

  // 使用简单的 Promise 包装，等待单篇下载完成
  let result: { success: boolean; type?: string; message?: string } | null = null;

  await articleDownloader.start([body.articleId], 1, (progressEvent) => {
    if (progressEvent.type === 'completed') {
      result = { success: true, type: 'completed', message: '正文下载成功' };
    } else if (progressEvent.type === 'deleted') {
      result = { success: false, type: 'deleted', message: '文章已被删除' };
    } else if (progressEvent.type === 'failed') {
      result = { success: false, type: 'failed', message: '下载失败，请检查代理节点配置' };
    }
  });

  if (!result) {
    throw createError({ statusCode: 500, message: '下载过程异常' });
  }

  if (!(result as any).success) {
    throw createError({ statusCode: 400, message: (result as any).message });
  }

  return result;
});
