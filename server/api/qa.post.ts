import { sql } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { generateEmbedding, chatCompletion } from '~/server/utils/embedding';

export default defineEventHandler(async (event) => {
  const body = await readBody<{ question: string; topic?: string }>(event);

  if (!body?.question?.trim()) {
    throw createError({ statusCode: 400, message: '请输入问题' });
  }

  const db = useDB();
  const question = body.question.trim();
  const topic = body.topic || '';

  // 1. 将问题向量化
  const questionEmbedding = await generateEmbedding(question);

  // 2. 向量相似度检索，支持按行业主题过滤
  const topicFilter = topic
    ? sql`AND a.matched_topic = ${topic}`
    : sql``;

  const results = await db.execute(sql`
    SELECT
      ac.id,
      ac.article_id,
      ac.content,
      a.title,
      a.link,
      a.matched_topic,
      1 - (ac.embedding <=> ${JSON.stringify(questionEmbedding)}::vector) as score
    FROM article_chunks ac
    JOIN articles a ON a.id = ac.article_id
    WHERE ac.embedding IS NOT NULL
      AND a.vectorized = true
      ${topicFilter}
    ORDER BY ac.embedding <=> ${JSON.stringify(questionEmbedding)}::vector
    LIMIT 5
  `);

  const references = (results.rows || []).map((row: any) => ({
    id: row.article_id,
    title: row.title,
    link: row.link,
    topic: row.matched_topic,
    score: parseFloat(row.score),
    snippet: row.content?.slice(0, 200) || '',
  }));

  // 3. 构建 RAG 上下文
  const context = references
    .map((ref, i) => `[${i + 1}] 《${ref.title}》${ref.topic ? `[${ref.topic}]` : ''}\n${ref.snippet}`)
    .join('\n\n');

  const topicHint = topic ? `当前检索范围：${topic}行业。` : '';

  const systemPrompt = `你是一个知识库助手。${topicHint}根据以下参考资料回答用户的问题。
如果参考资料中没有相关信息，请如实说明。回答时引用来源编号。

参考资料：
${context}`;

  // 4. 调用 LLM 生成回答
  const answer = await chatCompletion(systemPrompt, question);

  return { answer, references };
});
