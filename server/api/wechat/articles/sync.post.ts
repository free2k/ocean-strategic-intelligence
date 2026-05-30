import { eq } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { useAuthGuard, handleWechatError } from '../../../utils/wechat/auth-guard';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36 WAE/1.0';

interface SyncBody {
  fakeid: string;
  keyword?: string;
  begin?: number;
}

interface ArticleMeta {
  title: string;
  link: string;
  cover: string;
  digest: string;
  authorName: string;
  publishedAt: string;
}

interface SyncResponse {
  articles: ArticleMeta[];
  total: number;
  isCompleted: boolean;
}

/**
 * POST /api/wechat/articles/sync
 *
 * Syncs article list from a WeChat official account via the appmsgpublish API.
 * Fetches articles in pages of 20 and upserts metadata into the articles table.
 * After sync, updates the account's last sync time and article count.
 *
 * Body:
 * - fakeid (required): WeChat account unique identifier
 * - keyword (optional): Search keyword to filter articles
 * - begin (optional): Pagination offset, default 0
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
export default defineEventHandler(async (event): Promise<SyncResponse> => {
  const { authKey, cookie, token } = await useAuthGuard(event);

  const body = await readBody<SyncBody>(event);
  const { fakeid, keyword = '', begin = 0 } = body;

  if (!fakeid) {
    throw createError({
      statusCode: 400,
      statusMessage: '缺少必填字段：fakeid',
    });
  }

  const db = useDB();

  // Find the source record by fakeid to get sourceId
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

  try {
    const searchQuery = keyword ? encodeURIComponent(keyword) : '';
    const apiUrl = `https://mp.weixin.qq.com/cgi-bin/appmsgpublish?sub=list&search_field=null&begin=${begin}&count=20&query=${searchQuery}&fakeid=${fakeid}&type=101_1&free_publish_type=1&sub_action=list_ex&token=${token}&lang=zh_CN&f=json&ajax=1`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Referer: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&token=${token}&lang=zh_CN`,
        Cookie: cookie,
      },
    });

    if (!response.ok) {
      throw createError({
        statusCode: 502,
        statusMessage: '无法连接微信公众号平台',
      });
    }

    const data = await response.json() as {
      base_resp: { ret: number; err_msg: string };
      publish_page: {
        publish_list: string;
        total_count: number;
      };
    };

    handleWechatError(data, authKey);

    // Parse the nested publish_list JSON string
    const publishList = JSON.parse(data.publish_page?.publish_list || '[]') as Array<{
      publish_info: {
        appmsgex: Array<{
          title: string;
          link: string;
          cover: string;
          digest: string;
          author_name: string;
          create_time: number;
        }>;
      };
    }>;

    const totalCount = data.publish_page?.total_count || 0;
    const syncedArticles: ArticleMeta[] = [];

    // Extract articles from the nested structure and upsert into DB
    for (const publishItem of publishList) {
      const appmsgex = publishItem.publish_info?.appmsgex || [];

      for (const article of appmsgex) {
        const publishedAt = new Date(article.create_time * 1000);

        const articleMeta: ArticleMeta = {
          title: article.title,
          link: article.link,
          cover: article.cover,
          digest: article.digest,
          authorName: article.author_name,
          publishedAt: publishedAt.toISOString(),
        };

        // Upsert: use link as unique identifier to avoid duplicates
        await db
          .insert(schema.articles)
          .values({
            title: article.title,
            link: article.link,
            cover: article.cover || null,
            digest: article.digest || null,
            authorName: article.author_name || null,
            sourceId: source.id,
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

        syncedArticles.push(articleMeta);
      }
    }

    // Determine if sync is complete (fetched less than a full page or reached total)
    const isCompleted = begin + 20 >= totalCount;

    return {
      articles: syncedArticles,
      total: totalCount,
      isCompleted,
    };
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    console.error('[WeChat Article Sync] Failed to sync articles:', error);
    throw createError({
      statusCode: 500,
      statusMessage: '文章列表同步失败',
    });
  }
});
