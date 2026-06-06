import { desc, eq, and, gte, inArray } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { chatCompletion } from '~/server/utils/embedding';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Header,
  TableOfContents,
  StyleLevel,
  ExternalHyperlink,
  PageBreak,
} from 'docx';

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

async function generateArticleSummary(article: {
  title: string;
  content?: string | null;
  digest?: string | null;
  summary?: string | null;
}): Promise<string> {
  if (article.summary && article.summary.length >= 200 && article.summary.length <= 600) {
    return article.summary;
  }
  const source = article.content || article.digest || '';
  if (!source || source.length < 50) {
    return article.digest || article.summary || '（无正文内容）';
  }
  const cleanText = source.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const inputText = cleanText.slice(0, 3000);
  let wordGuide: string;
  if (cleanText.length < 300) wordGuide = '200字左右';
  else if (cleanText.length < 1000) wordGuide = '300字左右';
  else wordGuide = '400字左右';

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
    overseas?: string;
  }>(event);

  const db = useDB();
  const conditions = [];

  if (body?.topic) conditions.push(eq(schema.articles.matchedTopic, body.topic));
  if (body?.dateRange) {
    const since = parseDateRange(body.dateRange);
    if (since) conditions.push(gte(schema.articles.publishedAt, since));
  }
  if (body?.sourceType) conditions.push(eq(schema.articles.sourceType, body.sourceType));
  if (body?.sourceId) conditions.push(eq(schema.articles.sourceId, body.sourceId));
  if (body?.filterStatus) conditions.push(eq(schema.articles.filterStatus, body.filterStatus));

  // Filter by overseas status
  if (body?.overseas === 'true' || body?.overseas === 'false') {
    const overseasSources = await db.select({ id: schema.sources.id })
      .from(schema.sources)
      .where(eq(schema.sources.isOverseas, body.overseas === 'true'));
    const ids = overseasSources.map(s => s.id);
    if (ids.length > 0) {
      conditions.push(inArray(schema.articles.sourceId, ids));
    } else if (body.overseas === 'true') {
      throw createError({ statusCode: 400, message: '没有符合条件的文章' });
    }
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

  // 去重
  const deduped: typeof articles = [];
  const seenTitles = new Map<string, number>();
  for (const article of articles) {
    const normalizedTitle = article.title.trim().toLowerCase();
    const existingIdx = seenTitles.get(normalizedTitle);
    if (existingIdx === undefined) {
      seenTitles.set(normalizedTitle, deduped.length);
      deduped.push(article);
    } else {
      const existing = deduped[existingIdx];
      const isBetterContent = !existing.content && article.content;
      const isBetterLink = /x\.com|twitter\.com/.test(existing.link || '') && !/x\.com|twitter\.com/.test(article.link || '');
      if (isBetterContent || isBetterLink) {
        deduped[existingIdx] = { ...article, sourceName: `${article.sourceName || '未知'}、${existing.sourceName || '未知'}` };
      } else {
        deduped[existingIdx] = { ...existing, sourceName: `${existing.sourceName || '未知'}、${article.sourceName || '未知'}` };
      }
    }
  }

  // 按国内/外网 + 行业分组
  const hasBothDomesticAndOverseas = !body?.overseas;
  const domesticArticles = deduped.filter(a => !a.isOverseas);
  const overseasArticles = deduped.filter(a => a.isOverseas);

  function groupByTopic(articles: typeof deduped): Record<string, typeof deduped> {
    const grouped: Record<string, typeof deduped> = {};
    for (const article of articles) {
      const topic = article.matchedTopic || '未分类';
      if (!grouped[topic]) grouped[topic] = [];
      grouped[topic].push(article);
    }
    return grouped;
  }

  interface SectionGroup { [topic: string]: typeof deduped }
  const sections: { name: string; groups: SectionGroup }[] = [];

  if (hasBothDomesticAndOverseas) {
    if (domesticArticles.length > 0) {
      sections.push({ name: '国内资讯', groups: groupByTopic(domesticArticles) });
    }
    if (overseasArticles.length > 0) {
      sections.push({ name: '外网资讯', groups: groupByTopic(overseasArticles) });
    }
  } else {
    sections.push({ name: '', groups: groupByTopic(deduped) });
  }

  // 日期范围
  const dates = articles.map(a => new Date(a.publishedAt).getTime());
  const startDate = formatDate(new Date(Math.min(...dates)));
  const endDate = formatDate(new Date(Math.max(...dates)));

  // SSE 流式响应
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const sendEvent = (data: any) => {
    event.node.res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent({ type: 'start', total: deduped.length });

  // 构建 Word 文档
  const docChildren: Paragraph[] = [];
  const topicNumbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  let topicIndex = 0;
  let processed = 0;

  docChildren.push(new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { after: 200 },
    children: [new TextRun({ text: `${startDate}~${endDate}`, size: 24 })],
  }));

  docChildren.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 400, after: 200 },
    children: [new TextRun({ text: '目  录', bold: true, size: 32 })],
  }));

  docChildren.push(new Paragraph({
    children: [new TableOfContents('目录', {
      hyperlink: true,
      headingStyleRange: '1-3',
      stylesWithLevels: [new StyleLevel('Heading1', 1), new StyleLevel('Heading2', 2), new StyleLevel('Heading3', 3)],
    })],
  }));

  docChildren.push(new Paragraph({ children: [new PageBreak()] }));

  for (const section of sections) {
    // 如果有大分类标题（国内资讯/外网资讯）
    if (section.name) {
      const sectionPrefix = topicNumbers[topicIndex] || String(topicIndex + 1);
      topicIndex++;
      docChildren.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
        children: [new TextRun({ text: `${sectionPrefix}、${section.name}`, bold: true, size: 28 })],
      }));
    }

    for (const [topic, topicArticles] of Object.entries(section.groups)) {
      // 行业子分类标题：追加"要闻"后缀
      let topicDisplay = topic;
      if (topic !== '未分类' && !topic.endsWith('要闻') && !topic.endsWith('资讯')) {
        topicDisplay = `${topic}要闻`;
      }

      docChildren.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 150 },
        children: [new TextRun({ text: section.name ? `${topicDisplay}` : `${topicNumbers[topicIndex] || String(topicIndex + 1)}、${topicDisplay}`, bold: true, size: 26 })],
      }));
      if (!section.name) topicIndex++;

      for (let i = 0; i < topicArticles.length; i += 5) {
        const batch = topicArticles.slice(i, i + 5);

        for (const article of batch) {
          sendEvent({ type: 'progress', current: processed + 1, total: deduped.length, title: article.title });
        }

        const summaries = await Promise.all(batch.map(a => generateArticleSummary(a)));

        for (let j = 0; j < batch.length; j++) {
          const article = batch[j];
          const summaryText = summaries[j];
          const articleDate = new Date(article.publishedAt).toLocaleDateString('zh-CN');

          // 文章标题 (Heading 3 - 出现在目录中)
          docChildren.push(new Paragraph({
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 },
            children: [new TextRun({ text: `《${article.title}》`, bold: true, size: 24 })],
          }));

          docChildren.push(new Paragraph({
            spacing: { after: 100 },
            children: [new TextRun({ text: summaryText, size: 21 })],
          }));

          docChildren.push(new Paragraph({
            spacing: { after: 50 },
            children: [new TextRun({ text: `来源：${article.sourceName || '未知'}，${articleDate}`, size: 18, color: '666666' })],
          }));

          if (article.link) {
            docChildren.push(new Paragraph({
              spacing: { after: 200 },
              children: [
                new ExternalHyperlink({
                  children: [new TextRun({ text: article.link, size: 18, color: '0563C1', underline: {} })],
                  link: article.link,
                }),
              ],
            }));
          }

          processed++;
          sendEvent({ type: 'progress', current: processed, total: deduped.length, title: article.title });
        }
      }
    }
  }

  const doc = new Document({
    sections: [{
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: '海洋资源战略研究中心信息推送', bold: true, size: 40, color: 'CC0000' })],
          })],
        }),
      },
      children: docChildren,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const base64 = Buffer.from(buffer).toString('base64');

  sendEvent({ type: 'done', base64 });
  event.node.res.end();
});
