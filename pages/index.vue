<script setup lang="ts">
import * as echarts from 'echarts';

const { data: stats } = await useFetch('/api/stats');
const { data: categories } = await useFetch('/api/stats/categories');

const domesticChartRef = ref<HTMLElement | null>(null);
const overseasChartRef = ref<HTMLElement | null>(null);
let domesticChart: echarts.ECharts | null = null;
let overseasChart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

const hasDomesticData = computed(() => (categories.value?.domestic?.length ?? 0) > 0);
const hasOverseasData = computed(() => (categories.value?.overseas?.length ?? 0) > 0);

function buildPieOption(data: { name: string; count: number }[], title: string) {
  const colors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
  ];

  return {
    title: {
      text: title,
      left: 'center',
      top: 16,
      textStyle: {
        color: '#e2e8f0',
        fontSize: 16,
        fontWeight: 600,
      },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      borderColor: 'rgba(51, 65, 85, 0.8)',
      textStyle: { color: '#e2e8f0' },
      formatter: '{b}: {c} 篇 ({d}%)',
    },
    legend: {
      orient: 'vertical',
      right: 20,
      top: 'middle',
      textStyle: { color: '#94a3b8', fontSize: 12 },
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 10,
    },
    color: colors,
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['35%', '55%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 6,
          borderColor: 'rgba(15, 23, 42, 0.8)',
          borderWidth: 2,
        },
        label: {
          show: false,
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: 'bold',
            color: '#e2e8f0',
          },
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
        data: data.map(d => ({ name: d.name, value: d.count })),
      },
    ],
  };
}

function initCharts() {
  if (domesticChartRef.value && hasDomesticData.value) {
    domesticChart = echarts.init(domesticChartRef.value);
    domesticChart.setOption(buildPieOption(categories.value!.domestic, '国内资讯分类占比'));
  }
  if (overseasChartRef.value && hasOverseasData.value) {
    overseasChart = echarts.init(overseasChartRef.value);
    overseasChart.setOption(buildPieOption(categories.value!.overseas, '外网资讯分类占比'));
  }
}

onMounted(() => {
  initCharts();

  resizeObserver = new ResizeObserver(() => {
    domesticChart?.resize();
    overseasChart?.resize();
  });
  if (domesticChartRef.value) resizeObserver.observe(domesticChartRef.value);
  if (overseasChartRef.value) resizeObserver.observe(overseasChartRef.value);
});

watch(categories, () => {
  nextTick(() => {
    if (domesticChart && hasDomesticData.value) {
      domesticChart.setOption(buildPieOption(categories.value!.domestic, '国内资讯分类占比'));
    }
    if (overseasChart && hasOverseasData.value) {
      overseasChart.setOption(buildPieOption(categories.value!.overseas, '外网资讯分类占比'));
    }
  });
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  domesticChart?.dispose();
  overseasChart?.dispose();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Hero 区域 -->
    <div
      class="relative rounded-2xl overflow-hidden py-14 px-8 text-center"
      style="background-image: url('/bg/bg1.jpg'); background-size: cover; background-position: center;"
    >
      <div class="absolute inset-0 bg-gradient-to-br from-blue-900/70 to-purple-900/60" />
      <div class="relative z-10">
        <h1 class="text-4xl font-bold text-white mb-3">海洋能源资源情报分析</h1>
        <p class="text-lg text-blue-100">多渠道文章管理 · 向量化检索 · 智能问答</p>
      </div>
    </div>

    <!-- 数据概览 -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4" v-if="stats">
      <div class="bg-gray-800/60 backdrop-blur border border-gray-700/50 rounded-xl p-5 text-center">
        <div class="text-3xl font-bold text-blue-400">{{ stats.totalArticles }}</div>
        <div class="text-sm text-gray-400 mt-1">文章总数</div>
      </div>
      <div class="bg-gray-800/60 backdrop-blur border border-gray-700/50 rounded-xl p-5 text-center">
        <div class="text-3xl font-bold text-emerald-400">{{ stats.vectorizedArticles }}</div>
        <div class="text-sm text-gray-400 mt-1">已向量化</div>
      </div>
      <div class="bg-gray-800/60 backdrop-blur border border-gray-700/50 rounded-xl p-5 text-center">
        <div class="text-3xl font-bold text-cyan-400">{{ stats.totalSources }}</div>
        <div class="text-sm text-gray-400 mt-1">来源渠道</div>
      </div>
      <div class="bg-gray-800/60 backdrop-blur border border-gray-700/50 rounded-xl p-5 text-center">
        <div class="text-3xl font-bold text-violet-400">{{ stats.totalChunks }}</div>
        <div class="text-sm text-gray-400 mt-1">知识片段</div>
      </div>
    </div>

    <!-- 分类占比图表 -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- 国内资讯 -->
      <div class="bg-gray-800/50 backdrop-blur border border-gray-700/50 rounded-xl overflow-hidden">
        <div v-if="hasDomesticData" ref="domesticChartRef" class="w-full h-[340px]" />
        <div v-else class="flex flex-col items-center justify-center h-[340px] text-gray-500">
          <UIcon name="i-heroicons-chart-pie" class="text-4xl mb-3 text-gray-600" />
          <p class="text-sm">国内资讯暂无分类数据</p>
          <p class="text-xs text-gray-600 mt-1">等待爬取录入中...</p>
        </div>
      </div>

      <!-- 外网资讯 -->
      <div class="bg-gray-800/50 backdrop-blur border border-gray-700/50 rounded-xl overflow-hidden">
        <div v-if="hasOverseasData" ref="overseasChartRef" class="w-full h-[340px]" />
        <div v-else class="flex flex-col items-center justify-center h-[340px] text-gray-500">
          <UIcon name="i-heroicons-chart-pie" class="text-4xl mb-3 text-gray-600" />
          <p class="text-sm">外网资讯暂无分类数据</p>
          <p class="text-xs text-gray-600 mt-1">等待爬取录入中...</p>
        </div>
      </div>
    </div>

    <!-- 底部提示 -->
    <div class="text-center text-sm text-gray-500 dark:text-gray-400 py-2">
      💡 点击右下角的浮动按钮，随时使用智能问答功能
    </div>
  </div>
</template>
