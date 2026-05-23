import { chatCompletion } from './embedding';

export interface SummaryResult {
  articleId: number;
  summary: string;
  method: 'llm' | 'original';
}

/**
 * 为单篇文章生成摘要
 * - 前置条件：filterStatus === 'accepted' 且 matchedTopic 不为空
 * - 正文 < 100 字时直接使用原文
 * - 正文 >= 100 字时调用 LLM 生成 300-400 字纯段落摘要
 */
export async function generateSummary(article: {
  id: number;
  title: string;
  content: string;
  link: string;
  filterStatus: string;
  matchedTopic: string | null;
}): Promise<SummaryResult> {
  // 检查前置条件
  if (article.filterStatus !== 'accepted' || !article.matchedTopic) {
    throw new Error(
      `Precondition not met: filterStatus="${article.filterStatus}", matchedTopic="${article.matchedTopic}". ` +
      `Article must be accepted with a non-empty matchedTopic.`
    );
  }

  // 短文章直接使用原文
  if (article.content.length < 100) {
    return {
      articleId: article.id,
      summary: article.content,
      method: 'original',
    };
  }

  // 调用 LLM 生成摘要
  const systemPrompt = `你是一个专业的资讯摘要助手。请为以下文章生成一段摘要。

要求：
1. 摘要长度控制在300-400字之间
2. 使用纯段落文本格式，不使用列表、编号、子标题或任何Markdown格式
3. 保持客观、信息密度高的风格
4. 概括文章的核心观点和关键信息`;

  const userMessage = `文章标题：${article.title}
所属行业：${article.matchedTopic}

文章内容：
${article.content}`;

  const response = await chatCompletion(systemPrompt, userMessage);

  let summary = response.trim();

  // 超出 400 字时截断并记录警告
  if (summary.length > 400) {
    console.warn(
      `[Summary] Article ${article.id}: LLM response exceeded 400 characters (${summary.length}), truncating.`
    );
    summary = summary.slice(0, 400);
  }

  return {
    articleId: article.id,
    summary,
    method: 'llm',
  };
}
