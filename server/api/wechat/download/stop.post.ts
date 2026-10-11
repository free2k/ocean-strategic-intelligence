import { articleDownloader } from '~/server/utils/wechat/article-downloader';

export default defineEventHandler(() => {
  articleDownloader.stop();
  return { success: true };
});
