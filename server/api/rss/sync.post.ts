import { eq } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { parseRssXml, DEFAULT_FIELD_MAPPING } from '~/server/utils/rss-parser';
import { ProxyAgent } from 'undici';

/** Get proxy dispatcher if DOWNLOAD_PROXY is configured */
function getProxyDispatcher() {
  const proxyUrl = process.env.DOWNLOAD_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl) {
    return new ProxyAgent(proxyUrl);
  }
  return undefined;
}

interface SyncBody {
  sourceId: number;
  maxArticles?: number;
  sinceDate?: string;
}

/** Strip HTML tags from a string */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * POST /api/rss/sync
 * Fetches RSS feed from the source URL and imports articles.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<SyncBody>(event);

  if (!body?.sourceId) {
    throw createError({ statusCode: 400, statusMessage: '缺少 sourceId' });
  }

  const db = useDB();

  // Get source record (alias stores the RSS URL)
  const [source] = await db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.id, body.sourceId))
    .limit(1);

  if (!source || !source.alias || source.type !== 'rss') {
    throw createError({ statusCode: 404, statusMessage: '未找到 RSS 源或缺少 URL' });
  }

  const feedUrl = source.alias;
  if (source.fakeid?.startsWith('oilprice-')) {
    throw createError({statusCode:409,message:'OilPrice 由文章与图表专用流程自动同步，避免将 RSS 摘要误作全文。请在订阅管理的外部文章与图表证据面板查看进度。'});
  }
  const maxArticles = body.maxArticles ?? 50;
  if (!Number.isInteger(maxArticles) || maxArticles < 0) throw createError({statusCode:400,message:'文章数量须为非负整数，0 表示不限'});
  const sinceDateTs = body.sinceDate ? new Date(body.sinceDate).getTime() : 0;

  console.log(`[RSS Sync] 开始同步 sourceId=${source.id}, maxArticles=${maxArticles}`);

  // Fetch RSS feed
  let xmlContent: string;
  try {
    const dispatcher = getProxyDispatcher();
    const fetchOptions: any = {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)' },
      signal: AbortSignal.timeout(60000), // 60 second timeout
    };
    if (dispatcher) {
      fetchOptions.dispatcher = dispatcher;
    }

    const response = await fetch(feedUrl, fetchOptions);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    xmlContent = await response.text();
  } catch (err: any) {
    console.error(`[RSS Sync] sourceId=${source.id} 获取失败`);
    throw createError({ statusCode: 502, statusMessage: '无法获取 RSS 源，请检查地址和网络' });
  }

  // Parse RSS
  const parseResult = parseRssXml(xmlContent, DEFAULT_FIELD_MAPPING);

  if (parseResult.total === 0) {
    return { imported: 0, skipped: 0, failed: 0, total: 0 };
  }

  // Filter and limit articles
  let items = parseResult.items;

  if (sinceDateTs > 0) {
    items = items.filter(item => item.publishedAt.getTime() >= sinceDateTs);
  }

  if (maxArticles > 0) {
    items = items.slice(0, maxArticles);
  }

  // Insert articles
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const link = item.link || item.extractedUrl || '';
      if (!link || !item.title) {
        failed++;
        continue;
      }

      const result = await db.insert(schema.articles).values({
        title: item.title,
        link,
        cover: item.cover || null,
        content: item.content || null,
        digest: item.content ? stripHtml(item.content).substring(0, 200) : null,
        sourceId: source.id,
        sourceType: 'rss',
        publishedAt: item.publishedAt,
        downloadStatus: item.content ? 'downloaded' : 'pending',
      }).onConflictDoNothing({ target: schema.articles.link });

      if (result.rowCount && result.rowCount > 0) {
        imported++;
      } else {
        skipped++;
      }
    } catch {
      failed++;
    }
  }

  console.log(`[RSS Sync] sourceId=${source.id} 完成: 新增=${imported}, 跳过=${skipped}, 失败=${failed}, 总计=${items.length}`);
  return { imported, skipped, failed, total: items.length };
});
