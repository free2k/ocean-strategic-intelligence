import { chatCompletionStream } from '~/server/utils/embedding';

const CHART_SYSTEM_PROMPT = `你是一位资深数据分析师助手。用户会提供数据，你需要根据需求生成图表。

回复风格要求：
- 以数据分析师的视角简短回复，1-2句话说明图表展示了什么、有什么关键发现
- 不要解释代码、不要提及 JSON、ECharts、option 等技术术语
- 不要说"下面为你生成"之类的话，直接给出分析结论
- 回复示例："已为您绘制2021-2025年人口变化趋势图。数据显示总人口呈下降趋势，城镇人口持续增长而乡村人口加速减少。"

图表配置规则（用户不可见，仅供你内部使用）：
- 在回复文字之后，附上 ECharts option JSON，用 \`\`\`json 代码块包裹
- 根据数据特征选择合适的图表类型
- 包含 tooltip、legend、axis 等辅助元素
- 使用美观专业的配色方案
- 中文标注标题和坐标轴
- JSON 中不要使用函数或注释`;

interface GenerateRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  dataSample: Record<string, any>[];
  columns: string[];
  currentOption?: object;
}

export default defineEventHandler(async (event) => {
  const body = await readBody<GenerateRequest>(event);

  if (!body?.messages?.length || !body?.columns?.length) {
    throw createError({ statusCode: 400, message: '请提供 messages 和 columns' });
  }

  // Build system prompt with data context
  const dataSample = (body.dataSample || []).slice(0, 20);
  let systemContent = CHART_SYSTEM_PROMPT;
  systemContent += `\n\n当前数据列：${body.columns.join(', ')}`;
  systemContent += `\n数据样本（前${dataSample.length}行）：\n${JSON.stringify(dataSample, null, 2)}`;

  if (body.currentOption) {
    systemContent += `\n\n当前图表配置（用户可能要求修改）：\n\`\`\`json\n${JSON.stringify(body.currentOption, null, 2)}\n\`\`\``;
  }

  // Assemble messages for LLM
  const llmMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemContent },
    ...body.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  // SSE streaming response
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const sendEvent = (data: any) => {
    event.node.res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    let fullContent = '';
    const stream = chatCompletionStream(llmMessages, { temperature: 0.3, maxTokens: 4000 });

    for await (const chunk of stream) {
      fullContent += chunk;
      sendEvent({ type: 'chunk', content: chunk });
    }

    sendEvent({ type: 'done', content: fullContent });
  } catch (error: any) {
    sendEvent({ type: 'error', message: error.message || 'AI 生成失败，请重试' });
  }

  event.node.res.end();
});
