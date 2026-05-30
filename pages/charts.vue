<script setup lang="ts">
import type { ParsedFileResult } from '~/composables/useFileParser';
import type { ChatMessage } from '~/composables/useChartChat';

const { messages, isLoading, currentOption, sendMessage, reset } = useChartChat();
const { getSampleData } = useFileParser();

// Page state
const parsedData = ref<Record<string, any>[]>([]);
const columns = ref<string[]>([]);
const hasData = computed(() => parsedData.value.length > 0);

function handleFileUploaded(result: ParsedFileResult) {
  parsedData.value = result.data;
  columns.value = result.columns;
  // Reset chat when new data is uploaded
  reset();
}

function handleSend(message: string) {
  sendMessage(message, parsedData.value, columns.value);
}
</script>

<template>
  <div class="h-[calc(100vh-64px-64px)] flex flex-col md:flex-row gap-0 -mx-4 sm:-mx-6 lg:-mx-8 -my-8">
    <!-- Left: Chat Panel (40%) -->
    <aside class="w-full md:w-[40%] border-r border-gray-200 dark:border-gray-700 flex flex-col shrink-0 bg-white dark:bg-gray-800">
      <ChartsChatPanel
        :messages="messages"
        :is-loading="isLoading"
        :has-data="hasData"
        @send="handleSend"
        @file-uploaded="handleFileUploaded"
      />
    </aside>

    <!-- Right: Chart Panel (60%) -->
    <main class="flex-1 min-w-0 bg-gray-50 dark:bg-gray-900">
      <ChartsChartPanel :option="currentOption" />
    </main>
  </div>
</template>
