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
import { chatCompletion } from '~/server/utils/embedding';

export interface ArticleForDocx {
  title: string;
  link: string;
  content?: string | null;
  digest?: string | null;
  summary?: string | null;
  matchedTopic?: string | null;
  publishedAt: Date | string;
  sourceName?: string | null;
  isOverseas?: boolean | null;
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}年${m}月${d}日`;
}

export async function generateArticleSummary(article: {
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
  const wordGuide = cleanText.length < 300 ? '200字左右' : cleanText.length < 1000 ? '300字左右' : '400字左右';

  const systemPrompt = `你是一位专业的行业资讯编辑。请对给定的文章生成一段精炼的中文摘要。
要求：
- 摘要字数控制在${wordGuide}，可根据内容丰富度适当增减
- 保留文章的核心信息、关键数据和重要结论
- 使用客观、专业的语言风格
- 不要添加"本文"、"该文章"等引导词，直接陈述内容
- 如果文章涉及具体项目、合同金额、技术参数等关键数据，务必保留
- 输出纯文本，不要使用 Markdown 格式`;

  try {
    const summary = await chatCompletion(systemPrompt, `文章标题：${article.title}\n\n文章内容：\n${inputText}`);
    return summary.trim() || article.digest || '（摘要生成失败）';
  } catch {
    const fallback = cleanText.slice(0, 400);
    const lastPeriod = Math.max(fallback.lastIndexOf('。'), fallback.lastIndexOf('；'));
    return lastPeriod > 200 ? fallback.slice(0, lastPeriod + 1) : fallback + '……';
  }
}

/**
 * 根据文章列表生成 DOCX Buffer
 * 格式：国内资讯 → 各行业分类 → 外网资讯 → 各行业分类
 */
export async function buildDocxBuffer(articles: ArticleForDocx[]): Promise<{
  buffer: Buffer;
  filename: string;
  startDate: string;
  endDate: string;
}> {
  // 按国内/外网分组，再按行业分组
  const domesticGrouped: Record<string, ArticleForDocx[]> = {};
  const overseasGrouped: Record<string, ArticleForDocx[]> = {};

  for (const article of articles) {
    const topic = article.matchedTopic || '未分类';
    if (article.isOverseas) {
      if (!overseasGrouped[topic]) overseasGrouped[topic] = [];
      overseasGrouped[topic].push(article);
    } else {
      if (!domesticGrouped[topic]) domesticGrouped[topic] = [];
      domesticGrouped[topic].push(article);
    }
  }

  // 构建分区列表
  const sections: { name: string; groups: Record<string, ArticleForDocx[]> }[] = [];
  if (Object.keys(domesticGrouped).length > 0) sections.push({ name: '国内资讯', groups: domesticGrouped });
  if (Object.keys(overseasGrouped).length > 0) sections.push({ name: '外网资讯', groups: overseasGrouped });

  // 日期范围
  const dates = articles.map(a => new Date(a.publishedAt).getTime());
  const startDate = formatDate(new Date(Math.min(...dates)));
  const endDate = formatDate(new Date(Math.max(...dates)));

  // 构建内容
  const docChildren: Paragraph[] = [];

  // 日期行
  docChildren.push(new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { after: 200 },
    children: [new TextRun({ text: `${startDate}~${endDate}`, size: 24 })],
  }));

  // 目录标题
  docChildren.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 400, after: 300 },
    children: [new TextRun({ text: '目  录', bold: true, size: 32 })],
  }));

  // TOC 域（带页码）
  docChildren.push(new Paragraph({
    children: [new TableOfContents('目录', {
      hyperlink: true,
      headingStyleRange: '1-3',
      stylesWithLevels: [
        new StyleLevel('Heading1', 1),
        new StyleLevel('Heading2', 2),
        new StyleLevel('Heading3', 3),
      ],
    })],
  }));

  // 分页
  docChildren.push(new Paragraph({ children: [new PageBreak()] }));

  const topicNumbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  let sectionIndex = 0;

  for (const section of sections) {
    const sectionPrefix = topicNumbers[sectionIndex] || String(sectionIndex + 1);
    sectionIndex++;

    // 大分类标题（国内资讯/外网资讯）- Heading 1
    docChildren.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
      children: [new TextRun({ text: `${sectionPrefix}、${section.name}`, bold: true, size: 32 })],
    }));

    for (const [topic, topicArticles] of Object.entries(section.groups)) {
      let topicDisplay = topic;
      if (topic !== '未分类' && !topic.endsWith('要闻') && !topic.endsWith('资讯')) {
        topicDisplay = `${topic}要闻`;
      }

      // 行业标题 - Heading 2
      docChildren.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 150 },
        children: [new TextRun({ text: topicDisplay, bold: true, size: 28 })],
      }));

      // 生成文章摘要
      for (let i = 0; i < topicArticles.length; i += 5) {
        const batch = topicArticles.slice(i, i + 5);
        const summaries = await Promise.all(batch.map(a => generateArticleSummary(a)));

        for (let j = 0; j < batch.length; j++) {
          const article = batch[j];
          const summaryText = summaries[j];
          const articleDate = new Date(article.publishedAt).toLocaleDateString('zh-CN');

          // 文章标题 - Heading 3
          docChildren.push(new Paragraph({
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 250, after: 100 },
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
            children: [new TextRun({
              text: '海洋资源战略研究中心信息推送',
              bold: true,
              size: 52,
              font: '微软雅黑',
              color: 'CC0000',
            })],
          })],
        }),
      },
      children: docChildren,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = `信息资讯推送_${startDate}-${endDate}.docx`;

  return { buffer: buffer as Buffer, filename, startDate, endDate };
}
