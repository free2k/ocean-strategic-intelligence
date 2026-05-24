<script setup lang="ts">
const { data: stats, refresh: refreshStats } = await useFetch('/api/stats');
const { data: sourcesData } = await useFetch('/api/sources');

// --- 管理功能 ---
const importLoading = ref(false);
const vectorizeLoading = ref(false);
const fetchContentLoading = ref(false);
const fetchContentPolling = ref<ReturnType<typeof setInterval> | null>(null);
const fetchContentTotal = ref(0);
const importResult = ref('');
const vectorizeResult = ref('');
const fetchContentResult = ref('');

async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  importLoading.value = true;
  importResult.value = '';

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const result = await $fetch('/api/articles/import', {
      method: 'POST',
      body: data,
    });
    importResult.value = `导入成功：新增 ${result.imported} 篇，跳过 ${result.skipped} 篇`;
    refreshStats();
  } catch (e: any) {
    importResult.value = `导入失败：${e.data?.message || e.message}`;
  } finally {
    importLoading.value = false;
    input.value = '';
  }
}

async function fetchAllContent() {
  fetchContentLoading.value = true;
  fetchContentResult.value = '';
  fetchContentTotal.value = stats.value?.missingContentArticles || 0;

  fetchContentPolling.value = setInterval(() => {
    refreshStats();
  }, 3000);

  try {
    const result = await $fetch('/api/articles/fetch-content', {
      method: 'POST',
      body: { all: true },
    });
    fetchContentResult.value = `抓取完成：成功 ${result.fetched} 篇，失败 ${result.failed} 篇`;
    refreshStats();
  } catch (e: any) {
    fetchContentResult.value = `抓取失败：${e.data?.message || e.message}`;
  } finally {
    fetchContentLoading.value = false;
    if (fetchContentPolling.value) {
      clearInterval(fetchContentPolling.value);
      fetchContentPolling.value = null;
    }
  }
}

async function vectorizeAll() {
  vectorizeLoading.value = true;
  vectorizeResult.value = '';

  try {
    const result = await $fetch('/api/articles/vectorize', {
      method: 'POST',
      body: { all: true },
    });
    vectorizeResult.value = `向量化完成：处理 ${result.vectorized}/${result.total} 篇`;
    refreshStats();
  } catch (e: any) {
    vectorizeResult.value = `向量化失败：${e.data?.message || e.message}`;
  } finally {
    vectorizeLoading.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- 页面标题带背景 -->
    <div
      class="relative rounded-xl overflow-hidden py-8 px-6"
      style="background-image: url('/bg/bg2.jpg'); background-size: cover; background-position: center;"
    >
      <div class="absolute inset-0 bg-gradient-to-r from-gray-900/80 to-gray-800/60" />
      <h1 class="relative z-10 text-2xl font-bold text-white">管理后台</h1>
    </div>

    <!-- Tab 导航 -->
    <UTabs :items="[{ label: '数据管理', slot: 'management' }, { label: '过滤规则', slot: 'filters' }]">
      <template #management>
        <div class="space-y-6 pt-4">
          <!-- 数据统计 -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">数据概览</h3>
            </template>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4" v-if="stats">
              <div>
                <div class="text-2xl font-bold">{{ stats.totalArticles }}</div>
                <div class="text-sm text-gray-500">文章总数</div>
              </div>
              <div>
                <div class="text-2xl font-bold text-green-600">{{ stats.vectorizedArticles }}</div>
                <div class="text-sm text-gray-500">已向量化</div>
              </div>
              <div>
                <div class="text-2xl font-bold">{{ stats.totalSources }}</div>
                <div class="text-sm text-gray-500">来源渠道</div>
              </div>
              <div>
                <div class="text-2xl font-bold">{{ stats.totalChunks }}</div>
                <div class="text-sm text-gray-500">知识片段</div>
              </div>
            </div>
          </UCard>

          <!-- 导入文章 -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">批量导入</h3>
            </template>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
              上传 batch_sync.py 生成的 JSON 文件，自动解析并导入文章
            </p>
            <div class="flex items-center gap-4">
              <label class="cursor-pointer">
                <UButton as="span" :loading="importLoading" color="primary">
                  选择 JSON 文件
                </UButton>
                <input type="file" accept=".json" class="hidden" @change="handleImport" />
              </label>
              <span v-if="importResult" class="text-sm" :class="importResult.includes('失败') ? 'text-red-500' : 'text-green-600'">
                {{ importResult }}
              </span>
            </div>
          </UCard>

          <!-- 抓取正文 -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">抓取正文</h3>
            </template>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
              通过文章链接抓取微信公众号文章正文内容，为后续向量化提供完整文本
            </p>
            <div v-if="stats" class="flex items-center gap-4 mb-4 text-sm text-gray-600 dark:text-gray-400">
              <span>文章总数：<strong class="text-gray-900 dark:text-white">{{ stats.totalArticles }}</strong></span>
              <span>待抓取正文：<strong class="text-orange-500">{{ stats.missingContentArticles }}</strong></span>
              <span>已有正文：<strong class="text-green-600">{{ stats.totalArticles - stats.missingContentArticles }}</strong></span>
            </div>
            <div v-if="fetchContentLoading && fetchContentTotal > 0" class="mb-4">
              <div class="flex justify-between text-xs text-gray-500 mb-1">
                <span>抓取进度</span>
                <span>{{ fetchContentTotal - (stats?.missingContentArticles || 0) }} / {{ fetchContentTotal }}</span>
              </div>
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                <div
                  class="bg-blue-500 h-2.5 rounded-full transition-all duration-500"
                  :style="{ width: `${Math.min(100, ((fetchContentTotal - (stats?.missingContentArticles || 0)) / fetchContentTotal) * 100)}%` }"
                />
              </div>
            </div>
            <div class="flex items-center gap-4">
              <UButton @click="fetchAllContent" :loading="fetchContentLoading" color="blue" :disabled="stats?.missingContentArticles === 0">
                抓取全部缺失正文
              </UButton>
              <span v-if="fetchContentResult" class="text-sm" :class="fetchContentResult.includes('失败') ? 'text-red-500' : 'text-green-600'">
                {{ fetchContentResult }}
              </span>
            </div>
          </UCard>

          <!-- 向量化 -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">向量化管理</h3>
            </template>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
              对未向量化的文章生成 Embedding，用于后续的语义检索和问答
            </p>
            <div class="flex items-center gap-4">
              <UButton @click="vectorizeAll" :loading="vectorizeLoading" color="green">
                向量化全部未处理文章
              </UButton>
              <span v-if="vectorizeResult" class="text-sm" :class="vectorizeResult.includes('失败') ? 'text-red-500' : 'text-green-600'">
                {{ vectorizeResult }}
              </span>
            </div>
          </UCard>

          <!-- 来源列表 -->
          <UCard v-if="sourcesData?.sources?.length">
            <template #header>
              <h3 class="font-semibold">来源渠道</h3>
            </template>
            <UTable
              :rows="sourcesData.sources"
              :columns="[
                { key: 'name', label: '名称' },
                { key: 'type', label: '类型' },
                { key: 'alias', label: '别名' },
                { key: 'articleCount', label: '文章数' },
              ]"
            />
          </UCard>
        </div>
      </template>

      <template #filters>
        <AdminFiltersTab />
      </template>
    </UTabs>
  </div>
</template>
