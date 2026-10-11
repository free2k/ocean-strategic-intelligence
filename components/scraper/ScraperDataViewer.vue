<script setup lang="ts">
import * as echarts from 'echarts';
import type { ChatMessage, ChartItem } from '~/composables/useChartChat';

interface Props {
  source: {
    id: number;
    name: string;
  };
}

const props = defineProps<Props>();
const emit = defineEmits<{ close: [] }>();

const { messages, isLoading, currentOption, chartList, selectedChartId, sendMessage, selectChart, removeChart, reset } = useChartChat();

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
/** 多图表 ECharts 实例映射 */
const chartInstances = new Map<string, echarts.ECharts>();
const chartGridRef = ref<HTMLElement | null>(null);
/** 全屏模式 */
const isFullscreen = ref(false);

const currentPage = ref(1);
const pageSize = 200;

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

// 监听图表列表变化，渲染所有 ECharts 实例
watch(chartList, () => {
  if (activeTab.value === 'chart') {
    nextTick(() => renderAllCharts());
  }
}, { deep: true });

watch(activeTab, (tab) => {
  if (tab === 'chart' && chartList.value.length > 0) {
    nextTick(() => renderAllCharts());
  }
});

function renderAllCharts() {
  const prefix = isFullscreen.value ? 'chart-fs-' : 'chart-container-';
  for (const item of chartList.value) {
    const el = document.getElementById(`${prefix}${item.id}`);
    if (!el) continue;
    const key = `${prefix}${item.id}`;
    let instance = chartInstances.get(key);
    if (!instance) {
      instance = echarts.init(el);
      chartInstances.set(key, instance);
    }
    const option = { ...item.option };
    // 确保图表标题不会被截断
    if (option.title && !option.grid) {
      option.grid = { top: 60 };
    }
    instance.clear();
    instance.setOption(option);
    instance.resize();
  }
  // 清理已删除图表的实例
  for (const [key, instance] of chartInstances.entries()) {
    const id = key.replace('chart-fs-', '').replace('chart-container-', '');
    if (!chartList.value.find(c => c.id === id)) {
      instance.dispose();
      chartInstances.delete(key);
    }
  }
}

/** 全局 resize 时刷新所有图表 */
function resizeAllCharts() {
  for (const instance of chartInstances.values()) {
    instance.resize();
  }
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value;
  // 切换模式时销毁所有旧实例，让渲染函数重建
  for (const [key, instance] of chartInstances.entries()) {
    instance.dispose();
  }
  chartInstances.clear();
  // 等 DOM 渲染后重新初始化
  nextTick(() => renderAllCharts());
}

/** 导出某张图表为 PNG */
function exportChartPng(chartId: string) {
  const prefix = isFullscreen.value ? 'chart-fs-' : 'chart-container-';
  const instance = chartInstances.get(`${prefix}${chartId}`);
  if (!instance) return;
  const url = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#1f2937' });
  const link = document.createElement('a');
  link.href = url;
  link.download = `chart-${Date.now()}.png`;
  link.click();
}

/** 导出某张图表为独立 HTML */
function exportChartHtml(chartId: string) {
  const item = chartList.value.find(c => c.id === chartId);
  if (!item) return;
  const optionJson = JSON.stringify(item.option);
  const scriptTag = 'script';
  const lines = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <title>图表</title>',
    `  <${scriptTag} src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></${scriptTag}>`,
    '  <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { background: #fff; } #chart { width: 100vw; height: 100vh; }</style>',
    '</head>',
    '<body>',
    '  <div id="chart"></div>',
    `  <${scriptTag}>`,
    '    var chart = echarts.init(document.getElementById("chart"));',
    `    chart.setOption(${optionJson});`,
    '    window.addEventListener("resize", function() { chart.resize(); });',
    `  </${scriptTag}>`,
    '</body>',
    '</html>',
  ];
  const html = lines.join('\n');
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `chart-${Date.now()}.html`;
  link.click();
  URL.revokeObjectURL(url);
}

onMounted(async () => {
  window.addEventListener('resize', resizeAllCharts);
  await fetchData(1);
});

onUnmounted(() => {
  window.removeEventListener('resize', resizeAllCharts);
  for (const instance of chartInstances.values()) {
    instance.dispose();
  }
  chartInstances.clear();
  reset();
});

function formatTime(t: string) {
  return new Date(t).toLocaleString('zh-CN');
}
</script>

<template>
  <!-- 全屏覆盖层（Teleport 到 body） -->
  <Teleport to="body">
    <div
      v-if="isFullscreen"
      class="fixed inset-0 z-[100] bg-white dark:bg-gray-900 flex flex-col"
    >
      <!-- 全屏顶栏 -->
      <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <h3 class="text-sm font-medium text-gray-700 dark:text-gray-200">{{ source.name }} - 图表全屏</h3>
        <UButton
          icon="i-heroicons-arrows-pointing-in"
          size="xs"
          color="gray"
          variant="soft"
          @click="toggleFullscreen"
        >
          缩小
        </UButton>
      </div>
      <!-- 全屏图表网格 -->
      <div class="flex-1 overflow-y-auto p-6">
        <div v-if="chartList.length > 0" class="grid gap-5" :class="[
          chartList.length === 1 ? 'grid-cols-1' :
          chartList.length === 2 ? 'grid-cols-1 xl:grid-cols-2' :
          'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
        ]">
          <div
            v-for="item in chartList"
            :key="'fs-' + item.id"
            class="relative rounded-lg border-2 transition-all min-h-[420px] cursor-pointer"
            :class="selectedChartId === item.id
              ? 'border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500'"
            @click="selectChart(item.id)"
          >
            <!-- 操作按钮 -->
            <div class="absolute top-2 right-2 z-10 flex gap-1">
              <UBadge v-if="selectedChartId === item.id" color="primary" size="xs">编辑中</UBadge>
              <UTooltip text="导出 PNG">
                <UButton icon="i-heroicons-photo" size="2xs" color="gray" variant="soft" @click.stop="exportChartPng(item.id)" />
              </UTooltip>
              <UTooltip text="导出 HTML">
                <UButton icon="i-heroicons-code-bracket" size="2xs" color="gray" variant="soft" @click.stop="exportChartHtml(item.id)" />
              </UTooltip>
              <UButton icon="i-heroicons-x-mark" size="2xs" color="gray" variant="ghost" @click.stop="removeChart(item.id)" />
            </div>
            <!-- ECharts 容器（全屏用独立 id） -->
            <div :id="`chart-fs-${item.id}`" class="w-full h-full min-h-[400px]" />
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 普通弹窗内容 -->
  <UCard :ui="{ body: { padding: 'p-0' } }">
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-base font-semibold truncate pr-4">{{ source.name }} - 抓取数据</h3>
        <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" size="sm" @click="emit('close')" />
      </div>
    </template>

    <div class="flex flex-col" style="height: 85vh;">
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
          <UButton
            v-if="activeTab === 'chart' && chartList.length > 0"
            size="xs"
            color="gray"
            variant="ghost"
            icon="i-heroicons-arrows-pointing-out"
            @click="toggleFullscreen"
          >
            展开
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
          <div class="w-[260px] border-r border-gray-200 dark:border-gray-700 flex flex-col shrink-0">
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

          <!-- 右侧图表（多图网格） -->
          <div class="flex-1 min-w-0 p-4 overflow-y-auto">
            <div v-if="chartList.length > 0" ref="chartGridRef" class="grid gap-4" :class="[
              chartList.length === 1 ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2',
            ]">
              <div
                v-for="item in chartList"
                :key="item.id"
                class="relative rounded-lg border-2 cursor-pointer transition-all min-h-[320px]"
                :class="selectedChartId === item.id
                  ? 'border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'"
                @click="selectChart(item.id)"
              >
                <!-- 操作按钮组 -->
                <div class="absolute top-2 right-2 z-10 flex gap-1">
                  <UBadge v-if="selectedChartId === item.id" color="primary" size="xs">编辑中</UBadge>
                  <UTooltip text="导出 PNG">
                    <UButton icon="i-heroicons-photo" size="2xs" color="gray" variant="soft" @click.stop="exportChartPng(item.id)" />
                  </UTooltip>
                  <UTooltip text="导出 HTML">
                    <UButton icon="i-heroicons-code-bracket" size="2xs" color="gray" variant="soft" @click.stop="exportChartHtml(item.id)" />
                  </UTooltip>
                  <UButton icon="i-heroicons-x-mark" size="2xs" color="gray" variant="ghost" @click.stop="removeChart(item.id)" />
                </div>
                <!-- ECharts 容器 -->
                <div :id="`chart-container-${item.id}`" class="w-full h-full min-h-[300px]" />
              </div>
            </div>
            <div v-else class="h-full flex items-center justify-center text-center text-gray-400">
              <div>
                <UIcon name="i-heroicons-chart-bar" class="text-5xl mb-3" />
                <p class="text-sm">在左侧输入需求，AI 将基于表格数据生成图表</p>
                <p class="text-xs mt-1">支持一次生成多张图表，点击图表可选中并修改</p>
              </div>
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
