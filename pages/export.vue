<script setup lang="ts">
import { subDays, subMonths, format } from 'date-fns';

const rangePreset = ref('2weeks');
const customStart = ref('');
const customEnd = ref('');
const loading = ref(false);
const result = ref<{ content: string; articleCount: number; categories: string[]; message?: string } | null>(null);
const error = ref('');

const presetOptions = [
  { label: '最近 2 周', value: '2weeks' },
  { label: '最近 1 个月', value: '1month' },
  { label: '最近 3 个月', value: '3months' },
  { label: '自定义', value: 'custom' },
];

function getDateRange() {
  const now = new Date();
  const endDate = format(now, 'yyyy-MM-dd');

  if (rangePreset.value === '2weeks') {
    return { startDate: format(subDays(now, 14), 'yyyy-MM-dd'), endDate };
  }
  if (rangePreset.value === '1month') {
    return { startDate: format(subMonths(now, 1), 'yyyy-MM-dd'), endDate };
  }
  if (rangePreset.value === '3months') {
    return { startDate: format(subMonths(now, 3), 'yyyy-MM-dd'), endDate };
  }
  // custom
  return { startDate: customStart.value, endDate: customEnd.value };
}

async function doExport() {
  const { startDate, endDate } = getDateRange();

  if (!startDate || !endDate) {
    error.value = '请选择日期范围';
    return;
  }

  loading.value = true;
  error.value = '';
  result.value = null;

  try {
    const data = await $fetch('/api/export/markdown', {
      method: 'POST',
      body: { startDate, endDate, format: 'markdown' },
    });
    result.value = data as any;
  } catch (e: any) {
    error.value = e.data?.message || '导出失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}

function downloadMarkdown() {
  if (!result.value?.content) return;

  const blob = new Blob([result.value.content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const { startDate, endDate } = getDateRange();
  a.href = url;
  a.download = `行业资讯报告_${startDate}_${endDate}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">资讯导出</h1>
    <p class="text-gray-600 dark:text-gray-400">
      按日期区间导出已分类文章的摘要文档，按行业分组生成资讯报告
    </p>

    <!-- 导出配置 -->
    <UCard>
      <div class="space-y-4">
        <div class="flex items-center gap-4">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300 w-20">时间范围</label>
          <USelect
            v-model="rangePreset"
            :options="presetOptions"
            value-attribute="value"
            option-attribute="label"
            class="w-40"
          />
        </div>

        <div v-if="rangePreset === 'custom'" class="flex items-center gap-4">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300 w-20">起止日期</label>
          <input
            v-model="customStart"
            type="date"
            class="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm"
          />
          <span class="text-gray-500">至</span>
          <input
            v-model="customEnd"
            type="date"
            class="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm"
          />
        </div>

        <div class="flex items-center gap-4">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300 w-20">导出格式</label>
          <UBadge color="blue" size="sm">Markdown</UBadge>
        </div>

        <div class="pt-2">
          <UButton @click="doExport" :loading="loading" :disabled="loading" color="primary">
            导出资讯报告
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- 错误提示 -->
    <UAlert v-if="error" color="red" :title="error" />

    <!-- 空结果提示 -->
    <UAlert v-if="result && !result.content" color="yellow" :title="result.message || '无可导出内容'" />

    <!-- 导出结果 -->
    <UCard v-if="result?.content">
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-semibold">导出结果</h3>
            <p class="text-sm text-gray-500 mt-1">
              共 {{ result.articleCount }} 篇文章，覆盖 {{ result.categories.length }} 个行业类别
            </p>
          </div>
          <UButton @click="downloadMarkdown" color="green" size="sm">
            下载 .md 文件
          </UButton>
        </div>
      </template>

      <!-- Markdown 预览 -->
      <div class="prose dark:prose-invert max-w-none max-h-96 overflow-y-auto">
        <pre class="text-sm whitespace-pre-wrap">{{ result.content }}</pre>
      </div>
    </UCard>
  </div>
</template>
