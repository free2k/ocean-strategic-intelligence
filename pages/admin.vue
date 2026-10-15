<script setup lang="ts">
import * as echarts from 'echarts';

const { data: stats, refresh: refreshStats } = await useFetch('/api/stats');
const { data: sourcesData } = await useFetch('/api/sources');
const { data: topicsData } = await useFetch('/api/topics');

// --- 来源渠道图表 ---
const sourceChartEl = ref<HTMLElement | null>(null);
let sourceChartInstance: echarts.ECharts | null = null;

function renderSourceChart() {
  if (!sourceChartEl.value || !sourcesData.value?.sources?.length) return;

  if (!sourceChartInstance) {
    sourceChartInstance = echarts.init(sourceChartEl.value);
  }

  const sources = [...sourcesData.value.sources].sort((a, b) => (a.articleCount || 0) - (b.articleCount || 0));

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    },
    grid: {
      left: 120,
      right: 40,
      top: 20,
      bottom: 30,
    },
    xAxis: {
      type: 'value',
      axisLabel: { color: '#9ca3af' },
      splitLine: { lineStyle: { color: '#374151', type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: sources.map(s => s.name),
      axisLabel: { color: '#e5e7eb', fontSize: 12 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      data: sources.map(s => ({
        value: s.articleCount || 0,
        itemStyle: {
          color: s.type === 'wechat' ? '#3b82f6' : '#f97316',
          borderRadius: [0, 4, 4, 0],
        },
      })),
      barMaxWidth: 24,
      label: {
        show: true,
        position: 'right',
        color: '#9ca3af',
        fontSize: 11,
      },
    }],
  };

  sourceChartInstance.setOption(option);
  sourceChartInstance.resize();
}

onMounted(() => {
  nextTick(() => renderSourceChart());
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  sourceChartInstance?.dispose();
});

function handleResize() {
  sourceChartInstance?.resize();
}

watch(sourcesData, () => {
  nextTick(() => renderSourceChart());
});

// --- 管理功能 ---
const vectorizeLoading = ref(false);
const vectorizeResult = ref('');

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
    refreshVectorizedList();
  } catch (e: any) {
    vectorizeResult.value = `向量化失败：${e.data?.message || e.message}`;
  } finally {
    vectorizeLoading.value = false;
  }
}

// --- 已向量化文章列表 ---
const vecPage = ref(1);
const vecSearch = ref('');
const vecSearchInput = ref('');
const vecSourceType = ref('');
const vecDateRange = ref('');
const vecMatchedTopic = ref('');
const removingIds = ref<number[]>([]);

const { data: vecData, refresh: refreshVectorizedList } = await useFetch('/api/articles/vectorized', {
  query: computed(() => ({
    page: vecPage.value,
    pageSize: 15,
    search: vecSearch.value,
    sourceType: vecSourceType.value,
    dateRange: vecDateRange.value,
    matchedTopic: vecMatchedTopic.value,
  })),
  watch: [vecPage, vecSearch, vecSourceType, vecDateRange, vecMatchedTopic],
});

function doVecSearch() {
  vecSearch.value = vecSearchInput.value;
  vecPage.value = 1;
}

function resetVecFilters() {
  vecSearchInput.value = '';
  vecSearch.value = '';
  vecSourceType.value = '';
  vecDateRange.value = '';
  vecMatchedTopic.value = '';
  vecPage.value = 1;
}

async function removeVectorBatch(articleIds: number[]) {
  if (!articleIds.length) return;
  if (!confirm(`确定从知识库中移除 ${articleIds.length} 篇文章的向量数据？`)) return;
  removingIds.value = articleIds;
  try {
    await $fetch('/api/articles/remove-vector', { method: 'POST', body: { articleIds } });
    await refreshVectorizedList();
    await refreshStats();
  } catch (e: any) {
    alert(e.data?.message || '移除失败');
  } finally {
    removingIds.value = [];
  }
}

const sourceTypeOptions = [
  { label: '全部渠道', value: '' },
  { label: '微信公众号', value: 'wechat' },
  { label: 'RSS', value: 'rss' },
];

const dateRangeOptions = [
  { label: '全部时间', value: '' },
  { label: '最近3天', value: '3d' },
  { label: '最近1周', value: '1w' },
  { label: '最近2周', value: '2w' },
  { label: '最近1个月', value: '1m' },
  { label: '最近3个月', value: '3m' },
  { label: '最近6个月', value: '6m' },
  { label: '最近1年', value: '1y' },
];

const topicOptions = computed(() => {
  const list = topicsData.value?.topics || [];
  return [{ label: '全部分类', value: '' }, ...list.map(t => ({ label: t.name, value: t.name }))];
});

// --- 按日期向量化（从 articles 页面移过来） ---
const showVectorizeModal = ref(false);
const vectorizeStartDate = ref('');
const vectorizeEndDate = ref('');
const vectorizing = ref(false);
const vectorizeProgress = ref(0);
const vectorizeTotal = ref(0);
const vectorizeCurrentTitle = ref('');
const vectorizeRangeResult = ref<{ vectorized: number; total: number } | null>(null);
let vectorizeAbortController: AbortController | null = null;

function stopVectorize() {
  vectorizeAbortController?.abort();
  vectorizing.value = false;
}

async function startVectorizeRange() {
  if (!vectorizeStartDate.value || !vectorizeEndDate.value) return;
  vectorizing.value = true;
  vectorizeProgress.value = 0;
  vectorizeTotal.value = 0;
  vectorizeCurrentTitle.value = '';
  vectorizeRangeResult.value = null;
  showVectorizeModal.value = false;
  vectorizeAbortController = new AbortController();

  try {
    const response = await fetch('/api/articles/vectorize-range', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: vectorizeStartDate.value, endDate: vectorizeEndDate.value }),
      signal: vectorizeAbortController.signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${response.status}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'start') vectorizeTotal.value = data.total;
          else if (data.type === 'progress') {
            vectorizeProgress.value = data.current;
            vectorizeTotal.value = data.total;
            vectorizeCurrentTitle.value = data.title;
          } else if (data.type === 'done') {
            vectorizeRangeResult.value = { vectorized: data.vectorized, total: data.total };
          }
        } catch {}
      }
    }

    if (!vectorizeRangeResult.value && vectorizeTotal.value === 0) {
      vectorizeRangeResult.value = { vectorized: 0, total: 0 };
    }
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      alert(e.message || '向量化失败');
    }
  } finally {
    vectorizing.value = false;
    vectorizeAbortController = null;
    refreshVectorizedList();
    refreshStats();
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
    <UTabs :items="[{ label: '数据管理', slot: 'management' }, { label: '知识库文章', slot: 'vectorized' }, { label: '过滤规则', slot: 'filters' }]">
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
                <div class="text-sm text-gray-500">全渠道文章总数（去重）</div>
              </div>
              <div>
                <div class="text-2xl font-bold text-green-600">{{ stats.vectorizedArticles }}</div>
                <div class="text-sm text-gray-500">原文章库已向量化（篇）</div>
              </div>
              <div>
                <div class="text-2xl font-bold">{{ stats.totalSources }}</div>
                <div class="text-sm text-gray-500">原渠道登记（条）</div>
              </div>
              <div>
                <div class="text-2xl font-bold">{{ stats.totalChunks }}</div>
                <div class="text-sm text-gray-500">原文章库知识片段（个）</div>
              </div>
            </div>
          </UCard>

          <p v-if="stats" class="text-sm text-gray-500">全渠道：已纳入 {{ stats.classification.accepted }} + 已排除 {{ stats.classification.excluded }} + 待筛选 {{ stats.classification.pending }} = {{ stats.totalArticles }} 篇。向量化、片段与渠道登记单独统计。数据时间 {{ new Date(stats.observedAt).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'}) }}（北京时间）。</p>
          <!-- 向量化管理 -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">向量化管理</h3>
            </template>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
              对特定时间的文章生成向量，用于指定周期资讯的语义检索和问答，若在数据量庞大情况，该操作可能会较为耗时。
            </p>
            <div class="flex items-center gap-4">
              <!-- <UButton @click="vectorizeAll" :loading="vectorizeLoading" color="green">
                向量化全部未处理文章
              </UButton> -->
              <UButton @click="showVectorizeModal = true" color="yellow" variant="soft">
                按日期区间加入知识库
              </UButton>
              <span v-if="vectorizeResult" class="text-sm" :class="vectorizeResult.includes('失败') ? 'text-red-500' : 'text-green-600'">
                {{ vectorizeResult }}
              </span>
            </div>
          </UCard>

          <!-- 来源渠道图表 -->
          <UCard v-if="sourcesData?.sources?.length">
            <template #header>
              <h3 class="font-semibold">来源渠道</h3>
            </template>
            <div ref="sourceChartEl" style="width: 100%; height: 400px;" />
          </UCard>
        </div>
      </template>

      <template #vectorized>
        <div class="space-y-4 pt-4">
          <!-- 筛选栏 -->
          <UCard>
            <div class="flex flex-wrap items-center gap-3">
              <UInput v-model="vecSearchInput" placeholder="搜索标题..." @keyup.enter="doVecSearch" class="w-48" />
              <UButton @click="doVecSearch" color="primary" size="sm">搜索</UButton>
              <USelect v-model="vecSourceType" :options="sourceTypeOptions" value-attribute="value" option-attribute="label" class="w-36" />
              <USelect v-model="vecDateRange" :options="dateRangeOptions" value-attribute="value" option-attribute="label" class="w-36" />
              <USelect v-model="vecMatchedTopic" :options="topicOptions" value-attribute="value" option-attribute="label" class="w-44" />
              <UButton @click="resetVecFilters" color="gray" size="sm" variant="ghost">重置</UButton>
              <span class="text-sm text-gray-500 ml-auto" v-if="vecData">共 {{ vecData.total }} 篇已向量化</span>
            </div>
          </UCard>

          <!-- 文章列表 -->
          <div v-if="vecData?.articles?.length" class="space-y-2">
            <UCard v-for="article in vecData.articles" :key="article.id" class="hover:shadow-md transition-shadow">
              <div class="flex items-center justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <a :href="article.link" target="_blank" class="text-sm font-medium text-gray-900 dark:text-white hover:text-primary-600 line-clamp-1">
                    {{ article.title }}
                  </a>
                  <div class="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                    <UBadge :color="article.sourceType === 'wechat' ? 'blue' : 'orange'" size="xs" variant="subtle">
                      {{ article.sourceType === 'wechat' ? '公众号' : 'RSS' }}
                    </UBadge>
                    <span v-if="article.sourceName">{{ article.sourceName }}</span>
                    <span v-if="article.matchedTopic" class="text-primary-500">{{ article.matchedTopic }}</span>
                    <span>{{ new Date(article.publishedAt).toLocaleDateString('zh-CN') }}</span>
                  </div>
                </div>
                <UButton
                  @click="removeVectorBatch([article.id])"
                  size="xs"
                  color="red"
                  variant="ghost"
                  :loading="removingIds.includes(article.id)"
                >
                  移除
                </UButton>
              </div>
            </UCard>

            <div class="flex justify-center pt-4">
              <UPagination v-model="vecPage" :total="vecData.total" :page-count="vecData.pageSize" />
            </div>
          </div>
          <div v-else class="text-center py-12 text-gray-500">
            暂无已向量化的文章
          </div>
        </div>
      </template>

      <template #filters>
        <AdminFiltersTab />
      </template>
    </UTabs>

    <!-- 批量向量化弹窗 -->
    <UModal v-model="showVectorizeModal">
      <UCard>
        <template #header>
          <h3 class="font-semibold text-lg">按日期区间加入知识库</h3>
        </template>
        <div class="space-y-4">
          <p class="text-sm text-gray-500">
            将选定日期范围内的文章向量化到知识库中（排除被过滤词排除的文章）。向量化后支持语义搜索和智能问答。
          </p>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-1">开始日期</label>
              <UInput v-model="vectorizeStartDate" type="date" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">结束日期</label>
              <UInput v-model="vectorizeEndDate" type="date" />
            </div>
          </div>
          <UAlert color="blue" variant="subtle">
            <template #title>说明</template>
            <template #description>
              <ul class="text-xs space-y-1 list-disc list-inside">
                <li>无论分类状态如何，只要有正文内容都会被向量化</li>
                <li>已被「排除词」过滤的文章不会向量化</li>
                <li>已向量化的文章会被跳过</li>
              </ul>
            </template>
          </UAlert>
        </div>
        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton color="gray" variant="ghost" @click="showVectorizeModal = false">取消</UButton>
            <UButton color="primary" :disabled="!vectorizeStartDate || !vectorizeEndDate" @click="startVectorizeRange">
              开始向量化
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- 向量化进度弹窗 -->
    <UModal v-model="vectorizing" :prevent-close="true">
      <UCard>
        <template #header>
          <h3 class="font-semibold text-lg">向量化进行中...</h3>
        </template>
        <div class="space-y-4">
          <div class="flex justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>进度</span>
            <span>{{ vectorizeProgress }} / {{ vectorizeTotal }}</span>
          </div>
          <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
            <div
              class="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
              :style="{ width: vectorizeTotal > 0 ? `${(vectorizeProgress / vectorizeTotal) * 100}%` : '0%' }"
            />
          </div>
          <div v-if="vectorizeCurrentTitle" class="text-sm text-gray-500 truncate">
            <span class="text-gray-400">正在处理：</span>{{ vectorizeCurrentTitle }}
          </div>
          <div class="flex justify-end">
            <UButton color="red" variant="soft" size="sm" @click="stopVectorize">停止</UButton>
          </div>
        </div>
      </UCard>
    </UModal>

    <!-- 向量化结果提示 -->
    <UModal :model-value="!!vectorizeRangeResult" @close="vectorizeRangeResult = null">
      <UCard v-if="vectorizeRangeResult">
        <template #header>
          <h3 class="font-semibold text-lg">向量化完成</h3>
        </template>
        <div class="space-y-2">
          <p class="text-gray-700 dark:text-gray-300">
            成功向量化 <span class="font-bold text-primary-600">{{ vectorizeRangeResult.vectorized }}</span> 篇文章
            <span v-if="vectorizeRangeResult.total > vectorizeRangeResult.vectorized" class="text-gray-500">
              （{{ vectorizeRangeResult.total - vectorizeRangeResult.vectorized }} 篇跳过或失败）
            </span>
          </p>
          <p v-if="vectorizeRangeResult.total === 0" class="text-gray-500 text-sm">该日期范围内没有需要向量化的文章</p>
        </div>
        <template #footer>
          <div class="flex justify-end">
            <UButton color="primary" @click="vectorizeRangeResult = null">确定</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
