<script setup lang="ts">
import * as echarts from 'echarts';
import type { ChatMessage } from '~/composables/useChartChat';

interface Props {
  source: {
    id: number;
    name: string;
  };
}

const props = defineProps<Props>();
const emit = defineEmits<{ close: [] }>();

const { messages, isLoading, currentOption, sendMessage, reset } = useChartChat();

interface ScrapedDataFull {
  id: number;
  data: Record<string, any>[];
  columns: string[];
  rowCount: number;
  scrapedAt: string;
  page: number;
  pageSize: number;
  totalPages: number;
}

const loading = ref(true);
const latestData = ref<ScrapedDataFull | null>(null);
const activeTab = ref<'table' | 'chart'>('table');
const chatInput = ref('');
const chartRef = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;

const currentPage = ref(1);
const pageSize = 200;

onMounted(async () => {
  await fetchData(1);
});

async function fetchData(page: number) {
  loading.value = true;
  try {
    const result = await $fetch<ScrapedDataFull | null>('/api/scraper/data', {
      query: { sourceId: props.source.id, latest: 'true', page, pageSize },
    });
    latestData.value = result;
    currentPage.value = page;
  } finally {
    loading.value = false;
  }
}

function goToPage(page: number) {
  if (page < 1 || (latestData.value && page > latestData.value.totalPages)) return;
  fetchData(page);
}

// 发送对话（图表分析时使用采样数据，避免发送过多行到 LLM）
async function handleSend() {
  if (!chatInput.value.trim() || !latestData.value) return;
  const msg = chatInput.value.trim();
  chatInput.value = '';

  // 如果数据量大，获取全量数据用于图表（但只发采样给 LLM）
  let chartData = latestData.value.data;
  if (latestData.value.rowCount > pageSize) {
    // 获取完整数据用于图表生成
    try {
      const fullResult = await $fetch<ScrapedDataFull | null>('/api/scraper/data', {
        query: { sourceId: props.source.id, latest: 'true', page: 1, pageSize: latestData.value.rowCount },
      });
      if (fullResult) chartData = fullResult.data;
    } catch {}
  }

  sendMessage(msg, chartData, latestData.value.columns);
}

// 监听图表配置变化，渲染 ECharts
watch(currentOption, (opt) => {
  if (opt && activeTab.value === 'chart') {
    nextTick(() => renderChart(opt));
  }
}, { deep: true });

watch(activeTab, (tab) => {
  if (tab === 'chart' && currentOption.value) {
    nextTick(() => renderChart(currentOption.value));
  }
});

function renderChart(option: any) {
  if (!chartRef.value) return;
  if (!chart) {
    chart = echarts.init(chartRef.value);
  }
  // 确保图表标题不会被截断
  if (option.title && !option.grid) {
    option.grid = { top: 60 };
  }
  // 清除旧图表再重绘（notMerge=true 防止残留旧配置）
  chart.clear();
  chart.setOption(option);
  chart.resize();
}

onUnmounted(() => {
  chart?.dispose();
  reset();
});

function formatTime(t: string) {
  return new Date(t).toLocaleString('zh-CN');
}
</script>

<template>
  <UCard :ui="{ body: { padding: 'p-0' } }">
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-base font-semibold truncate pr-4">{{ source.name }} - 抓取数据</h3>
        <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" size="sm" @click="emit('close')" />
      </div>
    </template>

    <div class="flex flex-col" style="height: 75vh;">
      <!-- 顶部信息 + Tab 切换 -->
      <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div v-if="latestData" class="flex items-center gap-3 text-sm text-gray-500">
          <span>抓取时间: {{ formatTime(latestData.scrapedAt) }}</span>
          <span>共 {{ latestData.rowCount }} 行</span>
          <span v-if="latestData.totalPages > 1">第 {{ currentPage }}/{{ latestData.totalPages }} 页</span>
        </div>
        <div class="flex items-center gap-1">
          <UButton
            size="xs"
            :color="activeTab === 'table' ? 'primary' : 'gray'"
            :variant="activeTab === 'table' ? 'soft' : 'ghost'"
            icon="i-heroicons-table-cells"
            @click="activeTab = 'table'"
          >
            表格
          </UButton>
          <UButton
            size="xs"
            :color="activeTab === 'chart' ? 'primary' : 'gray'"
            :variant="activeTab === 'chart' ? 'soft' : 'ghost'"
            icon="i-heroicons-chart-bar"
            @click="activeTab = 'chart'"
          >
            图表分析
          </UButton>
        </div>
      </div>

      <!-- 表格视图 -->
      <div v-show="activeTab === 'table'" class="flex-1 overflow-auto px-5 py-3">
        <div v-if="latestData">
          <table class="w-full text-sm border-collapse">
            <thead class="sticky top-0 bg-gray-50 dark:bg-gray-700">
              <tr>
                <th
                  v-for="col in latestData.columns"
                  :key="col"
                  class="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300 border-b whitespace-nowrap"
                >
                  {{ col }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, idx) in latestData.data"
                :key="idx"
                class="hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <td
                  v-for="col in latestData.columns"
                  :key="col"
                  class="px-3 py-2 border-b border-gray-100 dark:border-gray-700 whitespace-nowrap"
                >
                  {{ row[col] ?? '-' }}
                </td>
              </tr>
            </tbody>
          </table>

          <!-- 分页控件 -->
          <div v-if="latestData.totalPages > 1" class="flex items-center justify-between py-3 border-t border-gray-200 dark:border-gray-700 mt-2">
            <span class="text-xs text-gray-500">
              显示第 {{ (currentPage - 1) * pageSize + 1 }}-{{ Math.min(currentPage * pageSize, latestData.rowCount) }} 行，共 {{ latestData.rowCount }} 行
            </span>
            <div class="flex items-center gap-2">
              <UButton size="xs" color="gray" variant="ghost" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">上一页</UButton>
              <span class="text-xs text-gray-500">{{ currentPage }} / {{ latestData.totalPages }}</span>
              <UButton size="xs" color="gray" variant="ghost" :disabled="currentPage >= latestData.totalPages" @click="goToPage(currentPage + 1)">下一页</UButton>
            </div>
          </div>
        </div>
        <div v-else-if="!loading" class="text-center py-8 text-gray-400">
          <p>暂无抓取数据，请先执行抓取</p>
        </div>
      </div>

      <!-- 图表分析视图 -->
      <div v-show="activeTab === 'chart'" class="flex-1 flex flex-col min-h-0">
        <div class="flex-1 flex min-h-0">
          <!-- 左侧对话 -->
          <div class="w-[340px] border-r border-gray-200 dark:border-gray-700 flex flex-col shrink-0">
            <!-- 消息列表 -->
            <div class="flex-1 overflow-y-auto p-3 space-y-3">
              <div v-if="messages.length === 0" class="text-center text-gray-400 text-sm py-8">
                <UIcon name="i-heroicons-sparkles" class="text-2xl mb-2" />
                <p>输入需求，AI 会根据数据生成图表</p>
                <p class="text-xs mt-1">例如：帮我画一个柱状图对比各指标</p>
              </div>
              <div
                v-for="(msg, idx) in messages"
                :key="idx"
                class="text-sm"
              >
                <div v-if="msg.role === 'user'" class="flex justify-end">
                  <div class="bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200 rounded-lg px-3 py-2 max-w-[90%]">
                    {{ msg.content }}
                  </div>
                </div>
                <div v-else class="flex justify-start">
                  <div class="bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2 max-w-[90%] text-gray-700 dark:text-gray-200 whitespace-pre-wrap text-sm">
                    <template v-if="msg.content">
                      {{ msg.content.replace(/```json[\s\S]*?(```|$)/g, '').trim() || '图表已生成 ✓' }}
                    </template>
                    <template v-else>
                      <span class="animate-pulse">思考中...</span>
                    </template>
                  </div>
                </div>
              </div>
            </div>

            <!-- 输入框 -->
            <div class="p-3 border-t border-gray-200 dark:border-gray-700">
              <div class="flex gap-2 items-end">
                <UTextarea
                  v-model="chatInput"
                  placeholder="描述你想要的图表..."
                  :rows="1"
                  autoresize
                  :maxrows="4"
                  size="sm"
                  class="flex-1"
                  :disabled="isLoading || !latestData"
                  @keydown.enter.exact="handleSend"
                />
                <UButton
                  icon="i-heroicons-paper-airplane"
                  size="sm"
                  :loading="isLoading"
                  :disabled="!chatInput.trim() || !latestData"
                  @click="handleSend"
                />
              </div>
            </div>
          </div>

          <!-- 右侧图表 -->
          <div class="flex-1 min-w-0 p-4 flex items-center justify-center">
            <div v-if="currentOption" ref="chartRef" class="w-full h-full min-h-[300px]" />
            <div v-else class="text-center text-gray-400">
              <UIcon name="i-heroicons-chart-bar" class="text-5xl mb-3" />
              <p class="text-sm">在左侧输入需求，AI 将基于表格数据生成图表</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex-1 flex items-center justify-center">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl text-gray-400" />
      </div>
    </div>
  </UCard>
</template>
