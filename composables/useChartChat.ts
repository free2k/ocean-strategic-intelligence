/**
 * Composable for managing AI chart generation chat.
 *
 * Handles conversation history, SSE communication with the chart generation API,
 * and extraction of ECharts configuration from AI responses.
 *
 * Requirements: 2.1, 2.2, 2.5, 3.1, 3.2, 3.4, 3.5
 */

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  chartOption?: any
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
  const currentOption = ref<any | null>(null)

  /**
   * Extract an ECharts option object from markdown ```json code blocks in text.
   *
   * Looks for the first valid JSON code block and attempts to parse it.
   * Returns null if no valid JSON block is found.
   */
  function extractChartOption(text: string): any | null {
    // Match ```json ... ``` code blocks
    const codeBlockRegex = /```json\s*\n?([\s\S]*?)```/g
    let match: RegExpExecArray | null

    while ((match = codeBlockRegex.exec(text)) !== null) {
      const jsonContent = match[1].trim()
      try {
        const parsed = JSON.parse(jsonContent)
        if (parsed && typeof parsed === 'object') {
          return parsed
        }
      }
      catch {
        // Continue to next code block if this one isn't valid JSON
        continue
      }
    }

    return null
  }

  /**
   * Send a message to the AI chart generation API via SSE.
   *
   * Assembles the request payload with conversation history, data sample (first 20 rows),
   * and columns. Streams the response and updates messages in real-time.
   */
  async function sendMessage(content: string, data: Record<string, any>[], columns: string[]): Promise<void> {
    // Add user message to history
    const userMessage: ChatMessage = {
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    messages.value.push(userMessage)

    // Prepare assistant message placeholder for streaming
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }
    messages.value.push(assistantMessage)

    isLoading.value = true

    try {
      // Build request payload - limit data sample to first 20 rows
      const dataSample = data.slice(0, 20)

      const payload: GenerateRequest = {
        messages: messages.value
          .filter(m => m.content) // exclude the empty assistant placeholder
          .filter(m => !(m.role === 'assistant' && m === assistantMessage))
          .map(m => ({ role: m.role, content: m.content })),
        dataSample,
        columns,
      }

      if (currentOption.value) {
        payload.currentOption = currentOption.value
      }

      // Initiate SSE request via fetch POST
      const response = await fetch('/api/charts/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

        // Process SSE events from buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const eventData = line.slice(6).trim()
            if (!eventData) continue

            try {
              const event = JSON.parse(eventData)

              if (event.type === 'chunk') {
                // Append streaming text to assistant message
                assistantMessage.content += event.content
                // Trigger reactivity update
                messages.value = [...messages.value]
              }
              else if (event.type === 'done') {
                // Set final complete content
                assistantMessage.content = event.content
                // Try to extract chart option from the complete response
                const option = extractChartOption(event.content)
                if (option) {
                  assistantMessage.chartOption = option
                  currentOption.value = option
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

      // If streaming ended without a 'done' event, try to extract option from accumulated content
      if (assistantMessage.content && !assistantMessage.chartOption) {
        const option = extractChartOption(assistantMessage.content)
        if (option) {
          assistantMessage.chartOption = option
          currentOption.value = option
          messages.value = [...messages.value]
        }
      }
    }
    catch (error: any) {
      // Update assistant message with error
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
   * Reset all chat state - clears conversation history and current chart option.
   */
  function reset(): void {
    messages.value = []
    isLoading.value = false
    currentOption.value = null
  }

  return {
    messages,
    isLoading,
    currentOption,
    sendMessage,
    extractChartOption,
    reset,
  }
}
