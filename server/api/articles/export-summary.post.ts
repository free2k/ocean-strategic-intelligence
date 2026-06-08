import { desc, eq, and, gte, inArray } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { chatCompletion } from '~/server/utils/embedding';
import { autoDownloadMissingContent } from '~/server/utils/auto-download';

function parseDateRange(range: string): Date | null {
  const now = new Date();
  switch (range) {
    case '1w': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '2w': return new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    case '1m': return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case '3m': return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    case '6m': return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    case '1y': return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    default: return null;
  }
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}年${m}月${d}日`;
}

/**
 * 使用 LLM 生成约400字的文章摘要
 * 根据文章篇幅适当调整字数：短文少写，长文多写
 */
async function generateArticleSummary(article: {
  title: string;
  content?: string | null;
  digest?: string | null;
  summary?: string | null;
}): Promise<string> {
  // 如果已有合适长度的 summary，直接使用
  if (article.summary && article.summary.length >= 200 && article.summary.length <= 600) {
    return article.summary;
  }

  const source = article.content || article.digest || '';
  if (!source || source.length < 50) {
    return article.digest || article.summary || '（无正文内容）';
  }

  // 清理 HTML 标签，取前 3000 字作为 LLM 输入（避免 token 过长）
  const cleanText = source.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const inputText = cleanText.slice(0, 3000);

  // 根据原文长度给出字数指导
  let wordGuide: string;
  if (cleanText.length < 300) {
    wordGuide = '200字左右';
  } else if (cleanText.length < 1000) {
    wordGuide = '300字左右';
  } else {
    wordGuide = '400字左右';
  }

  const systemPrompt = `你是一位专业的行业资讯编辑。请对给定的文章生成一段精炼的中文摘要。
要求：
- 摘要字数控制在${wordGuide}，可根据内容丰富度适当增减
- 保留文章的核心信息、关键数据和重要结论
- 使用客观、专业的语言风格
- 不要添加"本文"、"该文章"等引导词，直接陈述内容
- 如果文章涉及具体项目、合同金额、技术参数等关键数据，务必保留
- 输出纯文本，不要使用 Markdown 格式`;

  const userMessage = `文章标题：${article.title}\n\n文章内容：\n${inputText}`;

  try {
    const summary = await chatCompletion(systemPrompt, userMessage);
    return summary.trim() || article.digest || '（摘要生成失败）';
  } catch (e) {
    // LLM 调用失败时降级为截取正文
    console.error('LLM summary generation failed:', e);
    const fallback = cleanText.slice(0, 400);
    const lastPeriod = Math.max(fallback.lastIndexOf('。'), fallback.lastIndexOf('；'));
    return lastPeriod > 200 ? fallback.slice(0, lastPeriod + 1) : fallback + '……';
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    topic?: string;
    dateRange?: string;
    sourceType?: string;
    sourceId?: number;
    filterStatus?: string;
  }>(event);

  const db = useDB();
  const conditions = [];

  if (body?.topic) {
    conditions.push(eq(schema.articles.matchedTopic, body.topic));
  }
  if (body?.dateRange) {
    const since = parseDateRange(body.dateRange);
    if (since) conditions.push(gte(schema.articles.publishedAt, since));
  }
  if (body?.sourceType) {
    conditions.push(eq(schema.articles.sourceType, body.sourceType));
  }
  if (body?.sourceId) {
    conditions.push(eq(schema.articles.sourceId, body.sourceId));
  }
  if (body?.filterStatus) {
    conditions.push(eq(schema.articles.filterStatus, body.filterStatus));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const articles = await db.select({
    id: schema.articles.id,
    title: schema.articles.title,
    link: schema.articles.link,
    digest: schema.articles.digest,
    content: schema.articles.content,
    authorName: schema.articles.authorName,
    matchedTopic: schema.articles.matchedTopic,
    publishedAt: schema.articles.publishedAt,
    summary: schema.articles.summary,
    sourceName: schema.sources.name,
    isOverseas: schema.sources.isOverseas,
  })
    .from(schema.articles)
    .leftJoin(schema.sources, eq(schema.articles.sourceId, schema.sources.id))
    .where(where)
    .orderBy(desc(schema.articles.publishedAt))
    .limit(200);

  if (!articles.length) {
    throw createError({ statusCode: 400, message: '没有符合条件的文章' });
  }

  // 自动下载缺失正文的文章（只检查 content，digest 只是摘要不是全文）
  const missingContentIds = articles.filter(a => !a.content).map(a => a.id);
  if (missingContentIds.length > 0) {
    console.log(`[Export] 发现 ${missingContentIds.length} 篇缺正文，尝试自动下载...`);
    const { failed } = await autoDownloadMissingContent(missingContentIds);
    // 下载失败的文章从导出列表中移除（已被标记为 pending）
    if (failed.length > 0) {
      const failedSet = new Set(failed);
      articles = articles.filter(a => !failedSet.has(a.id));
    }
    // 重新加载已下载的文章内容
    const downloadedIds = missingContentIds.filter(id => !failed.includes(id));
    if (downloadedIds.length > 0) {
      const updatedArticles = await db.select({
        id: schema.articles.id,
        content: schema.articles.content,
        digest: schema.articles.digest,
      }).from(schema.articles).where(inArray(schema.articles.id, downloadedIds));

      const contentMap = new Map(updatedArticles.map(a => [a.id, a]));
      for (const article of articles) {
        const updated = contentMap.get(article.id);
        if (updated && updated.content) {
          (article as any).content = updated.content;
          if (updated.digest) (article as any).digest = updated.digest;
        }
      }
    }
  }

  if (!articles.length) {
    throw createError({ statusCode: 400, message: '所有文章正文下载失败，无法导出' });
  }

  // 按标题去重：相同标题的文章只保留一篇（优先保留有正文内容的、链接非社交媒体的）
  const deduped: typeof articles = [];
  const seenTitles = new Map<string, number>();

  for (const article of articles) {
    const normalizedTitle = article.title.trim().toLowerCase();
    const existingIdx = seenTitles.get(normalizedTitle);

    if (existingIdx === undefined) {
      seenTitles.set(normalizedTitle, deduped.length);
      deduped.push(article);
    } else {
      // 比较优先级：有正文 > 无正文，非社交媒体链接 > 社交媒体链接
      const existing = deduped[existingIdx];
      const isBetterContent = !existing.content && article.content;
      const isBetterLink = /x\.com|twitter\.com/.test(existing.link || '') && !/x\.com|twitter\.com/.test(article.link || '');

      if (isBetterContent || isBetterLink) {
        // 替换为更优的版本，合并来源信息
        deduped[existingIdx] = {
          ...article,
          sourceName: `${article.sourceName || '未知'}、${existing.sourceName || '未知'}`,
        };
      } else {
        // 保留已有版本，追加来源
        deduped[existingIdx] = {
          ...existing,
          sourceName: `${existing.sourceName || '未知'}、${article.sourceName || '未知'}`,
        };
      }
    }
  }

  // 按行业分类分组（外网来源归入"外网资讯"）
  const grouped: Record<string, typeof articles> = {};
  for (const article of deduped) {
    const topic = article.isOverseas ? '外网资讯' : (article.matchedTopic || '未分类');
    if (!grouped[topic]) grouped[topic] = [];
    grouped[topic].push(article);
  }

  // 计算日期范围
  const dates = articles.map(a => new Date(a.publishedAt).getTime());
  const startDate = formatDate(new Date(Math.min(...dates)));
  const endDate = formatDate(new Date(Math.max(...dates)));

  // 按模板格式生成文档
  let content = `# 信息资讯参考 ${startDate}-${endDate}\n\n---\n`;

  for (const [topic, topicArticles] of Object.entries(grouped)) {
    content += `\n## ${topic}\n\n`;

    // 并发生成摘要（每批 5 篇，避免并发过高）
    for (let i = 0; i < topicArticles.length; i += 5) {
      const batch = topicArticles.slice(i, i + 5);
      const summaries = await Promise.all(
        batch.map(article => generateArticleSummary(article)),
      );

      for (let j = 0; j < batch.length; j++) {
        const article = batch[j];
        const articleDate = new Date(article.publishedAt).toLocaleDateString('zh-CN');
        const summaryText = summaries[j];

        content += `### 《${article.title}》\n\n`;
        content += `${summaryText}\n\n`;
        content += `来源：${article.sourceName || '未知'}，${articleDate}\n`;
        content += `${article.link}\n\n`;
        content += `---\n\n`;
      }
    }
  }

  // 统计信息
  const sourceStats = deduped.reduce((acc, a) => {
    const name = a.sourceName || '未知';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const statsText = Object.entries(sourceStats)
    .map(([name, count]) => `${name}（${count}篇）`)
    .join('、');

  content += `*本资讯共计${deduped.length}篇文章，涵盖${statsText}，时间范围${startDate}至${endDate}。*\n`;

  const filename = `《信息资讯-参考${startDate}-${endDate}》.md`;

  return { content, filename, articleCount: deduped.length };
});
