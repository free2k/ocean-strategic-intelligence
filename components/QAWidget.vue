<script setup lang="ts">
import type { QAResult } from '~/types/article';

const isOpen = ref(false);
const question = ref('');
const selectedTopic = ref('');
const loading = ref(false);
const result = ref<(QAResult & { references: Array<QAResult['references'][0] & { topic?: string }> }) | null>(null);
const error = ref('');

const { data: topicsData } = await useFetch('/api/topics');

const topicOptions = computed(() => {
  const list = topicsData.value?.topics || [];
  return [
    { label: '全部行业', value: '' },
    ...list.map(t => ({ label: `${t.name} (${t.articleCount})`, value: t.name })),
  ];
});

async function askQuestion() {
  if (!question.value.trim()) return;

  loading.value = true;
  error.value = '';
  result.value = null;

  try {
    const data = await $fetch('/api/qa', {
      method: 'POST',
      body: {
        question: question.value,
        topic: selectedTopic.value || undefined,
      },
    });
    result.value = data as any;
  } catch (e: any) {
    error.value = e.data?.message || '请求失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}

function clearResult() {
  result.value = null;
  error.value = '';
}
</script>

<template>
  <!-- 浮动按钮 -->
  <div class="fixed bottom-6 right-6 z-50">
    <button
      @click="isOpen = !isOpen"
      class="group relative w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 flex items-center justify-center"
    >
      <!-- 高亮脉冲动画 -->
      <span class="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-30" />
      <svg v-if="!isOpen" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
      <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>

  <!-- 弹出小窗 -->
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="opacity-0 translate-y-4 scale-95"
    enter-to-class="opacity-100 translate-y-0 scale-100"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="opacity-100 translate-y-0 scale-100"
    leave-to-class="opacity-0 translate-y-4 scale-95"
  >
    <div
      v-if="isOpen"
      class="fixed bottom-24 right-6 z-50 w-[420px] max-h-[600px] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
    >
      <!-- 头部 -->
      <div class="bg-gradient-to-r from-blue-500 to-purple-600 px-5 py-4 text-white">
        <h3 class="text-lg font-bold">🤖 智能问答</h3>
        <p class="text-sm text-blue-100 mt-0.5">基于知识库的 AI 检索问答，你想了解什么？</p>
      </div>

      <!-- 内容区 -->
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <!-- 行业选择 -->
        <USelect
          v-model="selectedTopic"
          :options="topicOptions"
          value-attribute="value"
          option-attribute="label"
          placeholder="选择行业范围（可选）"
          size="sm"
        />

        <!-- 回答区域 -->
        <div v-if="result" class="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-gray-500">AI 回答</span>
            <button @click="clearResult" class="text-xs text-gray-400 hover:text-gray-600">清除</button>
          </div>
          <div class="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
            {{ result.answer }}
          </div>
          <!-- 参考来源 -->
          <div v-if="result.references?.length" class="pt-2 border-t border-gray-200 dark:border-gray-700">
            <p class="text-xs text-gray-500 mb-2">参考来源：</p>
            <div class="space-y-1">
              <a
                v-for="(ref, i) in result.references.slice(0, 5)"
                :key="ref.id"
                :href="ref.link"
                target="_blank"
                class="block text-xs text-primary-600 hover:underline truncate"
              >
                [{{ i + 1 }}] {{ ref.title }}
                <span class="text-gray-400 ml-1">{{ (ref.score * 100).toFixed(0) }}%</span>
              </a>
            </div>
          </div>
        </div>

        <!-- 错误提示 -->
        <div v-if="error" class="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg p-3">
          {{ error }}
        </div>
      </div>

      <!-- 输入区 -->
      <div class="border-t border-gray-200 dark:border-gray-700 p-4">
        <div class="flex gap-2">
          <UTextarea
            v-model="question"
            placeholder="输入你的问题..."
            :rows="2"
            class="flex-1"
            size="sm"
            @keydown.enter.exact.prevent="askQuestion"
            @keydown.shift.enter.stop
          />
          <UButton
            @click="askQuestion"
            :loading="loading"
            color="primary"
            class="self-end"
            size="sm"
          >
            发送
          </UButton>
        </div>
      </div>
    </div>
  </Transition>
</template>
