import { desc, eq, and, gte, isNotNull } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

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

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    topic?: string;
    dateRange?: string;
    sourceType?: string;
    sourceId?: number;
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

  // 只导出已通过的文章
  conditions.push(eq(schema.articles.filterStatus, 'accepted'));

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
  })
    .from(schema.articles)
    .leftJoin(schema.sources, eq(schema.articles.sourceId, schema.sources.id))
    .where(where)
    .orderBy(desc(schema.articles.publishedAt))
    .limit(200);

  if (!articles.length) {
    throw createError({ statusCode: 400, message: '没有符合条件的文章' });
  }

  // 按行业分类分组
  const grouped: Record<string, typeof articles> = {};
  for (const article of articles) {
    const topic = article.matchedTopic || '未分类';
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

    for (const article of topicArticles) {
      const articleDate = new Date(article.publishedAt).toLocaleDateString('zh-CN');
      const bodyText = article.summary || article.content || article.digest || '';

      content += `### 《${article.title}》\n\n`;
      content += `${bodyText}\n\n`;
      content += `来源：${article.sourceName || '未知'}，${articleDate}\n`;
      content += `${article.link}\n\n`;
      content += `---\n\n`;
    }
  }

  // 统计信息
  const sourceStats = articles.reduce((acc, a) => {
    const name = a.sourceName || '未知';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const statsText = Object.entries(sourceStats)
    .map(([name, count]) => `${name}（${count}篇）`)
    .join('、');

  content += `*本资讯共计${articles.length}篇文章，涵盖${statsText}，时间范围${startDate}至${endDate}。*\n`;

  const filename = `《信息资讯-参考${startDate}-${endDate}》.md`;

  return { content, filename, articleCount: articles.length };
});
