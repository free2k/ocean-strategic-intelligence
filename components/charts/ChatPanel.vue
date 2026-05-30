<script setup lang="ts">
import type { ParsedFileResult } from '~/composables/useFileParser'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  chartOption?: any
  timestamp: number
}

interface Props {
  messages: ChatMessage[]
  isLoading: boolean
  hasData: boolean
}

interface Emits {
  (e: 'send', message: string): void
  (e: 'fileUploaded', data: ParsedFileResult): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const { parseFile } = useFileParser()

const inputMessage = ref('')

/** 移除 markdown 代码块，只保留文字描述部分 */
function stripCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '').trim()
}
const fileInput = ref<HTMLInputElement | null>(null)
const messagesContainer = ref<HTMLElement | null>(null)
const uploadedFileName = ref('')
const uploadedPreview = ref<ParsedFileResult | null>(null)
const uploadError = ref('')
const isUploading = ref(false)

// Auto-scroll to bottom when messages change
watch(
  () => props.messages.length,
  () => {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })
  },
)

// Also scroll when loading state changes (streaming updates)
watch(
  () => props.messages,
  () => {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })
  },
  { deep: true },
)

function handleSend() {
  const message = inputMessage.value.trim()
  if (!message || props.isLoading) return
  emit('send', message)
  inputMessage.value = ''
}

function triggerFileUpload() {
  fileInput.value?.click()
}

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  uploadError.value = ''
  isUploading.value = true

  try {
    const result = await parseFile(file)
    uploadedFileName.value = file.name
    uploadedPreview.value = result
    emit('fileUploaded', result)
  }
  catch (error: any) {
    uploadError.value = error.message || '文件解析失败'
    uploadedFileName.value = ''
    uploadedPreview.value = null
  }
  finally {
    isUploading.value = false
    // Reset input so same file can be re-uploaded
    target.value = ''
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- File upload area -->
    <div class="p-4 border-b border-gray-200 dark:border-gray-700">
      <input
        ref="fileInput"
        type="file"
        accept=".xlsx,.xls,.csv"
        class="hidden"
        @change="handleFileChange"
      >
      <UButton
        icon="i-heroicons-arrow-up-tray"
        color="primary"
        variant="soft"
        block
        :loading="isUploading"
        @click="triggerFileUpload"
      >
        {{ uploadedFileName || '上传数据文件 (.xlsx / .xls / .csv)' }}
      </UButton>

      <!-- Upload error -->
      <p v-if="uploadError" class="mt-2 text-sm text-red-500">
        {{ uploadError }}
      </p>

      <!-- Data summary -->
      <div v-if="uploadedPreview" class="mt-3 space-y-2">
        <div class="flex items-center gap-2 flex-wrap">
          <UBadge color="green" variant="subtle" size="xs">
            {{ uploadedPreview.totalRows }} 行
          </UBadge>
          <UBadge
            v-for="col in uploadedPreview.columns"
            :key="col"
            color="gray"
            variant="subtle"
            size="xs"
          >
            {{ col }}
          </UBadge>
        </div>

        <!-- Preview table (first 5 rows) -->
        <div class="overflow-x-auto max-h-32 rounded border border-gray-200 dark:border-gray-700">
          <table class="text-xs w-full">
            <thead class="bg-gray-50 dark:bg-gray-800 sticky top-0">
              <tr>
                <th
                  v-for="col in uploadedPreview.columns"
                  :key="col"
                  class="px-2 py-1 text-left font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap"
                >
                  {{ col }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, idx) in uploadedPreview.preview"
                :key="idx"
                class="border-t border-gray-100 dark:border-gray-700"
              >
                <td
                  v-for="col in uploadedPreview.columns"
                  :key="col"
                  class="px-2 py-1 text-gray-700 dark:text-gray-300 whitespace-nowrap"
                >
                  {{ row[col] ?? '' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Messages list -->
    <div
      ref="messagesContainer"
      class="flex-1 overflow-y-auto p-4 space-y-4"
    >
      <!-- Empty state -->
      <div
        v-if="messages.length === 0"
        class="flex flex-col items-center justify-center h-full text-center text-gray-400 dark:text-gray-500"
      >
        <UIcon name="i-heroicons-chat-bubble-left-right" class="text-4xl mb-2" />
        <p class="text-sm">
          {{ hasData ? '数据已就绪，描述你想要的图表' : '上传数据文件后开始对话' }}
        </p>
      </div>

      <!-- Message bubbles -->
      <div
        v-for="(msg, idx) in messages"
        :key="idx"
        class="flex"
        :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <div
          class="max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
          :class="
            msg.role === 'user'
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
          "
        >
          {{ stripCodeBlocks(msg.content) }}
        </div>
      </div>

      <!-- Loading indicator -->
      <div v-if="isLoading" class="flex justify-start">
        <div class="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-2 flex items-center gap-2">
          <span class="flex gap-1">
            <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0ms" />
            <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 150ms" />
            <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 300ms" />
          </span>
          <span class="text-xs text-gray-500 dark:text-gray-400">AI 正在思考...</span>
        </div>
      </div>
    </div>

    <!-- Input area (fixed at bottom) -->
    <div class="p-4 border-t border-gray-200 dark:border-gray-700">
      <div class="flex gap-2">
        <UInput
          v-model="inputMessage"
          :placeholder="hasData ? '描述你想要的图表...' : '请先上传数据文件'"
          :disabled="!hasData || isLoading"
          class="flex-1"
          @keydown.enter.prevent="handleSend"
        />
        <UButton
          icon="i-heroicons-paper-airplane"
          color="primary"
          :disabled="!inputMessage.trim() || !hasData || isLoading"
          @click="handleSend"
        />
      </div>
    </div>
  </div>
</template>
