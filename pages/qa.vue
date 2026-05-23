<script setup lang="ts">
import type { QAResult } from '~/types/article';

const question = ref('');
const loading = ref(false);
const result = ref<QAResult | null>(null);
const error = ref('');

async function askQuestion() {
  if (!question.value.trim()) return;

  loading.value = true;
  error.value = '';
  result.value = null;

  try {
    const data = await $fetch<QAResult>('/api/qa', {
      method: 'POST',
      body: { question: question.value },
    });
    result.value = data;
  } catch (e: any) {
    error.value = e.data?.message || '请求失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">智能问答</h1>
    <p class="text-gray-600 dark:text-gray-400">
      基于已收录文章进行检索增强问答，回答将引用相关文章作为参考
    </p>

    <!-- 输入区 -->
    <div class="flex gap-2">
      <UTextarea
        v-model="question"
        placeholder="输入你的问题..."
        :rows="2"
        class="flex-1"
        @keydown.ctrl.enter="askQuestion"
      />
      <UButton @click="askQuestion" :loading="loading" color="primary" class="self-end">
        提问
      </UButton>
    </div>

    <!-- 错误提示 -->
    <UAlert v-if="error" color="red" :title="error" />

    <!-- 回答 -->
    <UCard v-if="result">
      <template #header>
        <h3 class="font-semibold">回答</h3>
      </template>
      <div class="prose dark:prose-invert max-w-none whitespace-pre-wrap">
        {{ result.answer }}
      </div>

      <!-- 参考来源 -->
      <div v-if="result.references?.length" class="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <h4 class="text-sm font-medium text-gray-500 mb-3">参考来源</h4>
        <div class="space-y-2">
          <div v-for="(ref, i) in result.references" :key="ref.id" class="text-sm">
            <a :href="ref.link" target="_blank" class="text-primary-600 hover:underline">
              [{{ i + 1 }}] {{ ref.title }}
            </a>
            <span class="text-gray-400 ml-2">相关度: {{ (ref.score * 100).toFixed(1) }}%</span>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
