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

/** 批量生成向量 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const config = useRuntimeConfig();
  const client = getClient();
  const response = await client.embeddings.create({
    model: config.embeddingModel,
    input: texts,
  });
  return response.data.map(d => d.embedding);
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
