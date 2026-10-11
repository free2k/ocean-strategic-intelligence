import { eq, and, isNotNull, gte, lte } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { startDate, endDate, format } = body || {};

  // Validate required parameters
  if (!startDate || !endDate) {
    throw createError({
      statusCode: 400,
      message: '请提供 startDate 和 endDate 参数',
    });
  }

  const db = useDB();

  // Query articles: accepted, matchedTopic not null, in date range, summary generated
  const articles = await db.select({
    id: schema.articles.id,
    title: schema.articles.title,
    summary: schema.articles.summary,
    link: schema.articles.link,
    matchedTopic: schema.articles.matchedTopic,
    publishedAt: schema.articles.publishedAt,
  })
    .from(schema.articles)
    .where(and(
      eq(schema.articles.filterStatus, 'accepted'),
      isNotNull(schema.articles.matchedTopic),
      eq(schema.articles.summaryStatus, 'generated'),
      gte(schema.articles.publishedAt, new Date(startDate)),
      lte(schema.articles.publishedAt, new Date(endDate)),
    ));

  // No articles found
  if (articles.length === 0) {
    return {
      content: '',
      articleCount: 0,
      categories: [],
      message: '所选日期区间内无可导出的资讯内容',
    };
  }

  // Group articles by matchedTopic
  const grouped: Record<string, typeof articles> = {};
  for (const article of articles) {
    const topic = article.matchedTopic!;
    if (!grouped[topic]) {
      grouped[topic] = [];
    }
    grouped[topic].push(article);
  }

  // Sort each group by publishedAt descending (newest first)
  for (const topic of Object.keys(grouped)) {
    grouped[topic].sort((a, b) => {
      const dateA = new Date(a.publishedAt).getTime();
      const dateB = new Date(b.publishedAt).getTime();
      return dateB - dateA;
    });
  }

  const categories = Object.keys(grouped);
  const totalCount = articles.length;
  const now = new Date();
  const exportTime = formatDateTime(now);

  // Generate Markdown document
  let markdown = `# 行业资讯报告\n\n`;
  markdown += `> 时间范围：${startDate} 至 ${endDate}\n`;
  markdown += `> 导出时间：${exportTime}\n`;
  markdown += `> 文章总数：${totalCount}\n\n`;
  markdown += `---\n`;

  for (const topic of categories) {
    markdown += `\n## ${topic}\n`;

    for (const article of grouped[topic]) {
      markdown += `\n### ${article.title}\n\n`;
      markdown += `${article.summary || ''}\n\n`;
      markdown += `> 原文链接：${article.link}\n`;
      markdown += `> 发布时间：${formatDateTime(new Date(article.publishedAt))}\n\n`;
      markdown += `---\n`;
    }
  }

  return {
    content: markdown,
    articleCount: totalCount,
    categories,
  };
});

function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
