/**
 * Composable for managing AI chart generation chat.
 *
 * Handles conversation history, SSE communication with the chart generation API,
 * and extraction of ECharts configuration from AI responses.
 * Supports multiple charts per response and selective chart editing.
 */

export interface ChartItem {
  id: string
  option: any
  /** 所属消息的索引 */
  messageIndex: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  chartOption?: any
  /** 一次回复可能包含多个图表 */
  chartOptions?: any[]
  timestamp: number
}

interface GenerateRequest {
  messages: { role: 'user' | 'assistant'; content: string }[]
  dataSample: Record<string, any>[]
  columns: string[]
  currentOption?: object
}

export function useChartChat() {
  const messages = ref<ChatMessage[]>([])
  const isLoading = ref(false)
  /** 所有图表列表（按生成顺序） */
  const chartList = ref<ChartItem[]>([])
  /** 当前选中的图表 ID（用于后续编辑） */
  const selectedChartId = ref<string | null>(null)

  /** 兼容旧接口 - 返回选中图表的 option 或最新一个 */
  const currentOption = computed(() => {
    if (selectedChartId.value) {
      return chartList.value.find(c => c.id === selectedChartId.value)?.option || null
    }
    return chartList.value.length > 0 ? chartList.value[chartList.value.length - 1].option : null
  })

  /**
   * Extract ALL ECharts option objects from markdown ```json code blocks in text.
   */
  function extractAllChartOptions(text: string): any[] {
    const codeBlockRegex = /```json\s*\n?([\s\S]*?)```/g
    const results: any[] = []
    let match: RegExpExecArray | null

    while ((match = codeBlockRegex.exec(text)) !== null) {
      const jsonContent = match[1].trim()
      try {
        const parsed = JSON.parse(jsonContent)
        if (parsed && typeof parsed === 'object') {
          results.push(parsed)
        }
      }
      catch {
        continue
      }
    }

    return results
  }

  /** 兼容旧 API */
  function extractChartOption(text: string): any | null {
    const options = extractAllChartOptions(text)
    return options.length > 0 ? options[0] : null
  }

  function selectChart(id: string | null) {
    selectedChartId.value = id
  }

  /**
   * Send a message to the AI chart generation API via SSE.
   */
  async function sendMessage(content: string, data: Record<string, any>[], columns: string[]): Promise<void> {
    const userMessage: ChatMessage = {
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    messages.value.push(userMessage)

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }
    messages.value.push(assistantMessage)

    isLoading.value = true

    try {
      const dataSample = data.slice(0, 20)

      const payload: GenerateRequest = {
        messages: messages.value
          .filter(m => m.content)
          .filter(m => !(m.role === 'assistant' && m === assistantMessage))
          .map(m => ({ role: m.role, content: m.content })),
        dataSample,
        columns,
      }

      // 如果有选中的图表，将其 option 作为编辑上下文
      if (selectedChartId.value) {
        const selected = chartList.value.find(c => c.id === selectedChartId.value)
        if (selected) {
          payload.currentOption = selected.option
        }
      } else if (chartList.value.length > 0) {
        // 默认使用最后一个图表作为上下文
        payload.currentOption = chartList.value[chartList.value.length - 1].option
      }

      const response = await fetch('/api/charts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('无法读取响应流')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const eventData = line.slice(6).trim()
            if (!eventData) continue

            try {
              const event = JSON.parse(eventData)

              if (event.type === 'chunk') {
                assistantMessage.content += event.content
                messages.value = [...messages.value]
              }
              else if (event.type === 'done') {
                assistantMessage.content = event.content
                // 提取所有图表
                const options = extractAllChartOptions(event.content)
                if (options.length > 0) {
                  assistantMessage.chartOptions = options
                  assistantMessage.chartOption = options[0]
                  addChartsFromResponse(options, messages.value.length - 1)
                }
                messages.value = [...messages.value]
              }
              else if (event.type === 'error') {
                assistantMessage.content = `错误: ${event.message}`
                messages.value = [...messages.value]
              }
            }
            catch {
              // Skip malformed SSE event data
            }
          }
        }
      }

      // 流结束后兜底提取
      if (assistantMessage.content && !assistantMessage.chartOptions?.length) {
        const options = extractAllChartOptions(assistantMessage.content)
        if (options.length > 0) {
          assistantMessage.chartOptions = options
          assistantMessage.chartOption = options[0]
          addChartsFromResponse(options, messages.value.length - 1)
          messages.value = [...messages.value]
        }
      }
    }
    catch (error: any) {
      const lastMessage = messages.value[messages.value.length - 1]
      if (lastMessage && lastMessage.role === 'assistant' && !lastMessage.content) {
        lastMessage.content = `网络连接失败，请重试: ${error.message || '未知错误'}`
        messages.value = [...messages.value]
      }
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * 将 AI 生成的图表加入列表。
   * 如果是对选中图表的修改，则替换；否则新增。
   */
  function addChartsFromResponse(options: any[], messageIndex: number) {
    if (selectedChartId.value && options.length === 1) {
      // 编辑模式：替换选中的图表
      const idx = chartList.value.findIndex(c => c.id === selectedChartId.value)
      if (idx >= 0) {
        chartList.value[idx] = { ...chartList.value[idx], option: options[0], messageIndex }
        chartList.value = [...chartList.value]
        return
      }
    }
    // 新增模式：追加所有新图表
    const newCharts = options.map((opt) => ({
      id: `chart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      option: opt,
      messageIndex,
    }))
    chartList.value = [...chartList.value, ...newCharts]
    // 自动选中最后一个新图表
    selectedChartId.value = newCharts[newCharts.length - 1].id
  }

  /** 删除某个图表 */
  function removeChart(id: string) {
    chartList.value = chartList.value.filter(c => c.id !== id)
    if (selectedChartId.value === id) {
      selectedChartId.value = chartList.value.length > 0 ? chartList.value[chartList.value.length - 1].id : null
    }
  }

  function reset(): void {
    messages.value = []
    isLoading.value = false
    chartList.value = []
    selectedChartId.value = null
  }

  return {
    messages,
    isLoading,
    currentOption,
    chartList,
    selectedChartId,
    sendMessage,
    selectChart,
    removeChart,
    extractChartOption,
    extractAllChartOptions,
    reset,
  }
}
