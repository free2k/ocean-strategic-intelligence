/**
 * ArticleDownloader manages concurrent downloading of WeChat article content
 * through proxy nodes. Supports retry with proxy switching, deletion detection,
 * and manual stop.
 */
import { ProxyAgent } from 'undici';
import { proxyManager } from './proxy-manager';

/** Maximum retry attempts per article (switching proxy each time) */
const MAX_RETRIES = 3;

/** Default concurrency limit */
const DEFAULT_CONCURRENCY = 3;

/**
 * HTTP proxy for outbound requests (e.g., to access .workers.dev from China).
 * Set DOWNLOAD_PROXY env var to your local proxy, e.g. "http://127.0.0.1:7890"
 */
function getProxyDispatcher() {
  const proxyUrl = process.env.DOWNLOAD_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl) {
    return new ProxyAgent(proxyUrl);
  }
  return undefined;
}

/** HTML markers indicating an article has been deleted or is unavailable */
const DELETION_MARKERS = [
  '该内容已被发布者删除',
  '此内容因违规无法查看',
  '此内容被投诉且经审核涉嫌侵权',
];

export interface DownloadProgressEvent {
  type: 'progress' | 'completed' | 'deleted' | 'failed' | 'finish';
  articleId: number;
  url?: string;
  stats?: {
    completed: number;
    failed: number;
    deleted: number;
    total: number;
  };
}

interface ArticleRecord {
  id: number;
  link: string;
}

export class ArticleDownloader {
  private stopped = false;
  private running = false;

  /**
   * Start downloading articles by their IDs.
   * @param articleIds - Array of article IDs to download
   * @param concurrency - Maximum number of concurrent downloads (default 3)
   * @param onProgress - Callback for progress events
   */
  async start(
    articleIds: number[],
    concurrency: number = DEFAULT_CONCURRENCY,
    onProgress: (event: DownloadProgressEvent) => void,
  ): Promise<void> {
    this.stopped = false;
    this.running = true;

    // Load proxy nodes from database before starting
    await proxyManager.loadFromDatabase();
    console.log(`[Download] 开始下载 ${articleIds.length} 篇文章, 代理节点: ${proxyManager.getProxies().map(p => p.url).join(', ') || '无'}`);

    const stats = { completed: 0, failed: 0, deleted: 0, total: articleIds.length };

    // Fetch article records from database
    const articles = await this.getArticleRecords(articleIds);

    // Use a semaphore pattern for concurrency control
    const queue = [...articles];
    const activePromises: Promise<void>[] = [];

    const processNext = async (): Promise<void> => {
      while (queue.length > 0 && !this.stopped) {
        const article = queue.shift()!;
        await this.downloadArticle(article, stats, onProgress);
      }
    };

    // Start `concurrency` number of workers
    const workerCount = Math.min(concurrency, queue.length);
    for (let i = 0; i < workerCount; i++) {
      activePromises.push(processNext());
    }

    await Promise.all(activePromises);

    this.running = false;

    // Emit finish event with final stats
    console.log(`[Download] 下载完成: 成功=${stats.completed}, 失败=${stats.failed}, 已删除=${stats.deleted}, 总计=${stats.total}`);
    onProgress({
      type: 'finish',
      articleId: 0,
      stats: { ...stats },
    });
  }

  /**
   * Stop the current download task.
   * Running downloads will complete, but no new downloads will start.
   */
  stop(): void {
    this.stopped = true;
  }

  /**
   * Check if the downloader is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Download a single article with retry logic.
   */
  private async downloadArticle(
    article: ArticleRecord,
    stats: { completed: number; failed: number; deleted: number; total: number },
    onProgress: (event: DownloadProgressEvent) => void,
  ): Promise<void> {
    if (this.stopped) return;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (this.stopped) return;

      const proxyUrl = proxyManager.getBestProxy();
      const proxyNode = proxyManager.getProxies().find((p) => p.url === proxyUrl);

      try {
        console.log(`[ArticleDownloader] Attempt ${attempt + 1}/${MAX_RETRIES} for article ${article.id} via proxy: ${proxyUrl}`);
        const html = await this.fetchArticleContent(article.link, proxyUrl, proxyNode?.authorization);
        proxyManager.recordSuccess(proxyUrl);

        // Check for deletion markers
        if (this.isArticleDeleted(html)) {
          await this.updateArticleStatus(article.id, 'deleted', null);
          stats.deleted++;
          onProgress({
            type: 'deleted',
            articleId: article.id,
            url: article.link,
            stats: { ...stats },
          });
          return;
        }

        // Download successful - store content
        await this.updateArticleStatus(article.id, 'downloaded', html);
        stats.completed++;
        onProgress({
          type: 'completed',
          articleId: article.id,
          url: article.link,
          stats: { ...stats },
        });
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(`[ArticleDownloader] Attempt ${attempt + 1} failed for article ${article.id}:`, lastError.message);
        proxyManager.recordFailure(proxyUrl);

        // If not the last attempt, continue to retry with a different proxy
        if (attempt < MAX_RETRIES - 1) {
          continue;
        }
      }
    }

    // All retries exhausted - mark as failed
    await this.updateArticleStatus(article.id, 'failed', null);
    stats.failed++;
    onProgress({
      type: 'failed',
      articleId: article.id,
      url: article.link,
      stats: { ...stats },
    });
  }

  /**
   * Fetch article HTML content through a proxy node.
   * Proxy format follows wechat-article-exporter convention:
   * ${proxy}?url=${encodeURIComponent(url)}&headers=${encodeURIComponent(JSON.stringify(headers))}
   */
  private async fetchArticleContent(
    articleUrl: string,
    proxyUrl: string,
    authorization?: string,
  ): Promise<string> {
    // Build proxy URL matching wechat-article-exporter format
    const articleHeaders: Record<string, string> = {};
    const targetUrl = `${proxyUrl}?url=${encodeURIComponent(articleUrl)}&headers=${encodeURIComponent(JSON.stringify(articleHeaders))}`;

    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    // Authorization is sent as HTTP header to the proxy, not as query param
    if (authorization) {
      fetchHeaders['Authorization'] = authorization;
    }

    const dispatcher = getProxyDispatcher();
    const fetchOptions: any = {
      headers: fetchHeaders,
      signal: AbortSignal.timeout(30000),
    };
    if (dispatcher) {
      fetchOptions.dispatcher = dispatcher;
    }

    const response = await fetch(targetUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  }

  /**
   * Check if the HTML content indicates the article has been deleted.
   */
  private isArticleDeleted(html: string): boolean {
    return DELETION_MARKERS.some((marker) => html.includes(marker));
  }

  /**
   * Get article records from the database.
   */
  private async getArticleRecords(articleIds: number[]): Promise<ArticleRecord[]> {
    const { useDB } = await import('../../db');
    const { articles } = await import('../../db/schema');
    const { inArray } = await import('drizzle-orm');

    const db = useDB();
    const records = await db
      .select({ id: articles.id, link: articles.link })
      .from(articles)
      .where(inArray(articles.id, articleIds));

    return records;
  }

  /**
   * Update article download status and optionally store content.
   */
  private async updateArticleStatus(
    articleId: number,
    status: 'downloaded' | 'deleted' | 'failed',
    content: string | null,
  ): Promise<void> {
    const { useDB } = await import('../../db');
    const { articles } = await import('../../db/schema');
    const { eq } = await import('drizzle-orm');

    const db = useDB();
    const updateData: Record<string, any> = {
      downloadStatus: status,
      updatedAt: new Date(),
    };

    if (content !== null) {
      updateData.content = content;
    }

    await db.update(articles).set(updateData).where(eq(articles.id, articleId));
  }
}

/** Singleton instance for use across the application */
export const articleDownloader = new ArticleDownloader();
