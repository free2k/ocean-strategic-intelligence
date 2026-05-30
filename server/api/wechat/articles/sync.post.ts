import { eq } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { useAuthGuard, handleWechatError } from '../../../utils/wechat/auth-guard';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36 WAE/1.0';

/** Delay between API requests to avoid rate limiting (ms) */
const REQUEST_DELAY_MS = 3000;

/** Page size for each API request */
const PAGE_SIZE = 5;

interface SyncBody {
  fakeid: string;
  keyword?: string;
  maxArticles?: number;
  sinceDate?: string; // ISO date string, stop syncing when articles are older than this
}

interface ArticleMeta {
  title: string;
  link: string;
  cover: string;
  digest: string;
  authorName: string;
  publishedAt: string;
}

interface SyncProgress {
  taskId: string;
  fakeid: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  total: number;
  synced: number;
  currentPage: number;
  message?: string;
  startedAt: number;
  updatedAt: number;
}

interface SyncStartResponse {
  taskId: string;
  message: string;
}

// In-memory sync task store
const syncTasks = new Map<string, SyncProgress>();

// Track running tasks per fakeid to prevent duplicate syncs
const runningFakeids = new Set<string>();

/**
 * POST /api/wechat/articles/sync
 *
 * Starts a background sync task for a WeChat official account.
 * Fetches articles page by page with rate limiting (3s between requests).
 * Supports stopping by date or max article count.
 *
 * Body:
 * - fakeid (required): WeChat account unique identifier
 * - keyword (optional): Search keyword to filter articles
 * - maxArticles (optional): Stop after syncing this many articles
 * - sinceDate (optional): Stop when articles are older than this date (ISO string)
 */
export default defineEventHandler(async (event): Promise<SyncStartResponse> => {
  const { authKey, cookie, token } = await useAuthGuard(event);

  const body = await readBody<SyncBody>(event);
  const { fakeid, keyword = '', maxArticles, sinceDate } = body;

  if (!fakeid) {
    throw createError({
      statusCode: 400,
      statusMessage: '缺少必填字段：fakeid',
    });
  }

  // Prevent duplicate sync for the same account
  if (runningFakeids.has(fakeid)) {
    throw createError({
      statusCode: 409,
      statusMessage: '该公众号正在同步中，请等待完成',
    });
  }

  const db = useDB();

  // Find the source record
  const [source] = await db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.fakeid, fakeid))
    .limit(1);

  if (!source) {
    throw createError({
      statusCode: 404,
      statusMessage: '未找到该公众号订阅记录',
    });
  }

  // Create task
  const taskId = `${fakeid}-${Date.now()}`;
  const now = Date.now();
  const task: SyncProgress = {
    taskId,
    fakeid,
    status: 'running',
    total: 0,
    synced: 0,
    currentPage: 0,
    startedAt: now,
    updatedAt: now,
  };
  syncTasks.set(taskId, task);
  runningFakeids.add(fakeid);

  // Parse sinceDate
  const sinceDateTs = sinceDate ? new Date(sinceDate).getTime() / 1000 : 0;

  // Start background sync (non-blocking)
  runSync(task, { cookie, token, authKey, fakeid, keyword, maxArticles, sinceDateTs, sourceId: source.id });

  return {
    taskId,
    message: '同步任务已启动',
  };
});

/** Background sync loop */
async function runSync(
  task: SyncProgress,
  opts: {
    cookie: string;
    token: string;
    authKey: string;
    fakeid: string;
    keyword: string;
    maxArticles?: number;
    sinceDateTs: number;
    sourceId: number;
  },
) {
  const db = useDB();
  let begin = 0;
  let totalSynced = 0;
  let reachedDateLimit = false;

  try {
    // First request to get total count
    while (true) {
      task.currentPage++;
      task.updatedAt = Date.now();

      const searchQuery = opts.keyword ? encodeURIComponent(opts.keyword) : '';
      const apiUrl = `https://mp.weixin.qq.com/cgi-bin/appmsgpublish?sub=list&search_field=null&begin=${begin}&count=${PAGE_SIZE}&query=${searchQuery}&fakeid=${opts.fakeid}&type=101_1&free_publish_type=1&sub_action=list_ex&token=${opts.token}&lang=zh_CN&f=json&ajax=1`;

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Referer: 'https://mp.weixin.qq.com/',
          Origin: 'https://mp.weixin.qq.com',
          'Accept-Encoding': 'identity',
          Cookie: opts.cookie,
        },
      });

      if (!response.ok) {
        task.status = 'failed';
        task.message = '无法连接微信公众号平台';
        break;
      }

      const data = await response.json() as {
        base_resp: { ret: number; err_msg: string };
        publish_page: any;
      };

      // Check for WeChat errors
      const ret = data.base_resp?.ret;
      if (ret === 200003) {
        task.status = 'failed';
        task.message = '登录已过期，请重新登录';
        break;
      }
      if (ret !== 0) {
        task.status = 'failed';
        task.message = `微信接口错误: ${data.base_resp?.err_msg || ret}`;
        break;
      }

      // Parse publish_page
      let publishPage: any = data.publish_page;
      if (typeof publishPage === 'string') {
        try { publishPage = JSON.parse(publishPage); } catch { publishPage = {}; }
      }

      const publishListItems: any[] = publishPage?.publish_list || [];
      const totalCount: number = publishPage?.total_count || 0;
      task.total = totalCount;

      if (publishListItems.length === 0) {
        task.status = 'completed';
        task.message = '同步完成，没有更多文章';
        break;
      }

      // Process articles
      for (const item of publishListItems) {
        let publishInfo: any = item.publish_info;
        if (typeof publishInfo === 'string') {
          try { publishInfo = JSON.parse(publishInfo); } catch { continue; }
        }
        if (!publishInfo) continue;

        const appmsgex: any[] = publishInfo.appmsgex || [];

        for (const article of appmsgex) {
          if (!article.title || !article.link) continue;

          // Check date limit
          if (opts.sinceDateTs > 0 && article.create_time < opts.sinceDateTs) {
            reachedDateLimit = true;
            break;
          }

          const publishedAt = new Date(article.create_time * 1000);

          await db
            .insert(schema.articles)
            .values({
              title: article.title,
              link: article.link,
              cover: article.cover || null,
              digest: article.digest || null,
              authorName: article.author_name || null,
              sourceId: opts.sourceId,
              sourceType: 'wechat',
              publishedAt,
            })
            .onConflictDoUpdate({
              target: schema.articles.link,
              set: {
                title: article.title,
                cover: article.cover || null,
                digest: article.digest || null,
                authorName: article.author_name || null,
                updatedAt: new Date(),
              },
            });

          totalSynced++;
          task.synced = totalSynced;
          task.updatedAt = Date.now();

          // Check max articles limit
          if (opts.maxArticles && totalSynced >= opts.maxArticles) {
            reachedDateLimit = true;
            break;
          }
        }

        if (reachedDateLimit) break;
      }

      if (reachedDateLimit) {
        task.status = 'completed';
        task.message = opts.maxArticles && totalSynced >= opts.maxArticles
          ? `已达到最大文章数限制 (${opts.maxArticles})`
          : '已同步到指定日期';
        break;
      }

      // Check if we've fetched all pages
      begin += publishListItems.length;
      if (begin >= totalCount) {
        task.status = 'completed';
        task.message = '全部文章同步完成';
        break;
      }

      // Check if task was stopped externally
      if (task.status !== 'running') {
        break;
      }

      // Rate limiting: wait before next request
      await sleep(REQUEST_DELAY_MS);
    }
  } catch (error: any) {
    task.status = 'failed';
    task.message = error?.message || '同步过程中发生错误';
    console.error('[WeChat Article Sync] Error:', error);
  } finally {
    task.updatedAt = Date.now();
    runningFakeids.delete(opts.fakeid);

    // Clean up old tasks after 10 minutes
    setTimeout(() => {
      syncTasks.delete(task.taskId);
    }, 10 * 60 * 1000);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export for use by progress and stop endpoints
export { syncTasks, runningFakeids };
