import OpenAI from 'openai';

let _client: OpenAI | null = null;

function getClient() {
  if (!_client) {
    const config = useRuntimeConfig();
    _client = new OpenAI({
      apiKey: config.openaiApiKey,
      baseURL: config.openaiBaseUrl,
    });
  }
  return _client;
}

/** 生成文本向量 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const config = useRuntimeConfig();
  const client = getClient();
  const response = await client.embeddings.create({
    model: config.embeddingModel,
    input: text,
  });
  return response.data[0].embedding;
}

/** 批量生成向量（自动分批，DashScope 限制每批最多 10 条） */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const config = useRuntimeConfig();
  const client = getClient();
  const BATCH_SIZE = 6; // DashScope 限制 10，留余量用 6
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    // 截断过长的文本（避免请求体超限）
    const truncatedBatch = batch.map(t => t.length > 2000 ? t.slice(0, 2000) : t);
    const response = await client.embeddings.create({
      model: config.embeddingModel,
      input: truncatedBatch,
    });
    results.push(...response.data.map(d => d.embedding));
  }

  return results;
}

/** 调用 Chat 模型进行问答 */
export async function chatCompletion(systemPrompt: string, userMessage: string): Promise<string> {
  const config = useRuntimeConfig();
  const client = getClient();
  const response = await client.chat.completions.create({
    model: config.chatModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  });
  return response.choices[0]?.message?.content || '';
}

/** 调用 Chat 模型进行多轮对话（流式返回） */
export async function* chatCompletionStream(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options?: { temperature?: number; maxTokens?: number },
): AsyncGenerator<string> {
  const config = useRuntimeConfig();
  const client = getClient();
  const stream = await client.chat.completions.create({
    model: config.chatModel,
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 4000,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

/** 将文章内容拆分为 chunks */
export function splitIntoChunks(text: string, maxChunkSize = 500): string[] {
  if (!text) return [];

  // 按段落分割
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (currentChunk.length + trimmed.length > maxChunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = trimmed;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text.slice(0, maxChunkSize)];
}
