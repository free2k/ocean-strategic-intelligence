import { sql, eq } from 'drizzle-orm';
import { useDB, schema } from '~/server/db';
import { generateEmbedding, chatCompletion } from '~/server/utils/embedding';

export default defineEventHandler(async (event) => {
  const body = await readBody<{ question: string }>(event);

  if (!body?.question?.trim()) {
    throw createError({ statusCode: 400, message: '请输入问题' });
  }

  const db = useDB();
  const question = body.question.trim();

  // 1. 将问题向量化
  const questionEmbedding = await generateEmbedding(question);

  // 2. 向量相似度检索（余弦相似度）
  const results = await db.execute(sql`
    SELECT
      ac.id,
      ac.article_id,
      ac.content,
      a.title,
      a.link,
      1 - (ac.embedding <=> ${JSON.stringify(questionEmbedding)}::vector) as score
    FROM article_chunks ac
    JOIN articles a ON a.id = ac.article_id
    WHERE ac.embedding IS NOT NULL
    ORDER BY ac.embedding <=> ${JSON.stringify(questionEmbedding)}::vector
    LIMIT 5
  `);

  const references = (results.rows || []).map((row: any) => ({
    id: row.article_id,
    title: row.title,
    link: row.link,
    score: parseFloat(row.score),
    snippet: row.content?.slice(0, 200) || '',
  }));

  // 3. 构建 RAG 上下文
  const context = references
    .map((ref, i) => `[${i + 1}] 《${ref.title}》\n${ref.snippet}`)
    .join('\n\n');

  const systemPrompt = `你是一个知识库助手。根据以下参考资料回答用户的问题。
如果参考资料中没有相关信息，请如实说明。回答时引用来源编号。

参考资料：
${context}`;

  // 4. 调用 LLM 生成回答
  const answer = await chatCompletion(systemPrompt, question);

  return { answer, references };
});
