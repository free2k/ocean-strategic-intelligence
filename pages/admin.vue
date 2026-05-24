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

// RSS Import
const rssFile = ref<File | null>(null);
const rssXmlContent = ref('');
const rssSourceName = ref('');
const rssLoading = ref(false);
const rssResult = ref('');
const rssShowMapping = ref(false);
const rssFieldMapping = ref({
  title: 'title',
  content: 'content:encoded',
  publishedAt: 'pubDate',
  link: 'link',
  cover: 'enclosure[url]',
});

async function handleRssFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  rssFile.value = file;
  rssXmlContent.value = await file.text();
  rssSourceName.value = file.name.replace(/\.xml$/i, '').replace(/-rss$/i, '');
  rssShowMapping.value = true;
}

async function handleRssImport() {
  if (!rssXmlContent.value || !rssSourceName.value) return;

  rssLoading.value = true;
  rssResult.value = '';

  try {
    const result = await $fetch('/api/articles/import-rss', {
      method: 'POST',
      body: {
        xmlContent: rssXmlContent.value,
        fieldMapping: rssFieldMapping.value,
        sourceName: rssSourceName.value,
      },
    });
    rssResult.value = `导入成功：新增 ${result.imported} 篇，跳过 ${result.skipped} 篇，失败 ${result.failed} 篇`;
    refreshStats();
  } catch (e: any) {
    rssResult.value = `导入失败：${e.data?.message || e.message}`;
  } finally {
    rssLoading.value = false;
  }
}

function resetRssForm() {
  rssFile.value = null;
  rssXmlContent.value = '';
  rssSourceName.value = '';
  rssShowMapping.value = false;
  rssResult.value = '';
  rssFieldMapping.value = {
    title: 'title',
    content: 'content:encoded',
    publishedAt: 'pubDate',
    link: 'link',
    cover: 'enclosure[url]',
  };
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

          <!-- RSS 导入 -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">RSS 导入</h3>
            </template>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
              上传 RSS XML 文件，配置字段映射后导入文章到知识库
            </p>

            <div class="space-y-4">
              <!-- 文件上传 -->
              <div class="flex items-center gap-4">
                <label class="cursor-pointer">
                  <UButton as="span" color="blue" :disabled="rssLoading">
                    选择 XML 文件
                  </UButton>
                  <input type="file" accept=".xml" class="hidden" @change="handleRssFileSelect" />
                </label>
                <span v-if="rssFile" class="text-sm text-gray-500">{{ rssFile.name }}</span>
              </div>

              <!-- 字段映射配置 -->
              <div v-if="rssShowMapping" class="space-y-3 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div class="flex items-center gap-3">
                  <label class="text-sm w-24 text-gray-600 dark:text-gray-400">来源名称</label>
                  <UInput v-model="rssSourceName" placeholder="如 Offshore Engineer" class="flex-1" />
                </div>
                <div class="text-xs text-gray-500 font-medium mt-2 mb-1">字段映射（XML 标签名）</div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div class="flex items-center gap-2">
                    <label class="text-xs w-16 text-gray-500">标题</label>
                    <UInput v-model="rssFieldMapping.title" size="sm" class="flex-1" />
                  </div>
                  <div class="flex items-center gap-2">
                    <label class="text-xs w-16 text-gray-500">正文</label>
                    <UInput v-model="rssFieldMapping.content" size="sm" class="flex-1" />
                  </div>
                  <div class="flex items-center gap-2">
                    <label class="text-xs w-16 text-gray-500">日期</label>
                    <UInput v-model="rssFieldMapping.publishedAt" size="sm" class="flex-1" />
                  </div>
                  <div class="flex items-center gap-2">
                    <label class="text-xs w-16 text-gray-500">链接</label>
                    <UInput v-model="rssFieldMapping.link" size="sm" class="flex-1" />
                  </div>
                  <div class="flex items-center gap-2">
                    <label class="text-xs w-16 text-gray-500">封面图</label>
                    <UInput v-model="rssFieldMapping.cover" size="sm" class="flex-1" />
                  </div>
                </div>

                <div class="flex items-center gap-3 pt-2">
                  <UButton @click="handleRssImport" :loading="rssLoading" color="primary">
                    开始导入
                  </UButton>
                  <UButton @click="resetRssForm" color="gray" variant="ghost" :disabled="rssLoading">
                    重置
                  </UButton>
                </div>
              </div>

              <!-- 结果显示 -->
              <span v-if="rssResult" class="text-sm" :class="rssResult.includes('失败') ? 'text-red-500' : 'text-green-600'">
                {{ rssResult }}
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
