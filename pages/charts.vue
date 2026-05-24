<script setup lang="ts">
import * as echarts from 'echarts';

const chartLine = ref<HTMLElement | null>(null);
const chartPie = ref<HTMLElement | null>(null);
const chartBar = ref<HTMLElement | null>(null);
const chartElectricity = ref<HTMLElement | null>(null);
const chartGas = ref<HTMLElement | null>(null);

let instances: echarts.ECharts[] = [];

onMounted(() => {
  initCharts();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  instances.forEach(i => i.dispose());
});

function handleResize() {
  instances.forEach(i => i.resize());
}

function initCharts() {
  // 图1：能源消费总量趋势
  if (chartLine.value) {
    const c = echarts.init(chartLine.value);
    c.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: '8%', right: '5%', bottom: '12%', top: '15%' },
      xAxis: {
        type: 'category',
        data: ['2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'],
      },
      yAxis: {
        type: 'value',
        name: '万吨标准煤',
        axisLabel: { formatter: (v: number) => (v / 10000).toFixed(0) + '万' },
      },
      series: [{
        name: '能源消费总量',
        type: 'line',
        data: [441492, 455827, 471925, 485584, 496514, 525027, 541274, 571327, 596000, 617000],
        smooth: true,
        lineStyle: { width: 4, color: '#5470C6' },
        itemStyle: { color: '#5470C6' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(84,112,198,0.4)' },
            { offset: 1, color: 'rgba(84,112,198,0.05)' },
          ]),
        },
        label: { show: true, position: 'top', fontSize: 10, color: '#5470C6' },
        markLine: {
          silent: true,
          data: [{ type: 'average', name: '平均值' }],
          lineStyle: { color: '#999', type: 'dashed' },
        },
      }],
    });
    instances.push(c);
  }

  // 图2：能源结构占比饼图
  if (chartPie.value) {
    const c = echarts.init(chartPie.value);
    c.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c}% ({d}%)' },
      legend: { bottom: '5%', left: 'center' },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
        label: { show: true, formatter: '{b}\n{c}%', fontSize: 12 },
        emphasis: {
          label: { show: true, fontSize: 14, fontWeight: 'bold' },
          itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' },
        },
        data: [
          { value: 53.2, name: '煤炭', itemStyle: { color: '#505050' } },
          { value: 18.2, name: '石油', itemStyle: { color: '#5470C6' } },
          { value: 8.8, name: '天然气', itemStyle: { color: '#FAC858' } },
          { value: 19.8, name: '一次电力及其他', itemStyle: { color: '#91CC75' } },
        ],
      }],
    });
    instances.push(c);
  }

  // 图3：主要能源消费品趋势
  if (chartBar.value) {
    const c = echarts.init(chartBar.value);
    c.setOption({
      tooltip: { trigger: 'axis' },
      legend: { top: 0, data: ['煤炭', '原油', '天然气', '电力'] },
      grid: { left: '10%', right: '5%', bottom: '15%', top: '40px' },
      xAxis: {
        type: 'category',
        data: ['2019', '2020', '2021', '2022', '2023', '2024'],
      },
      yAxis: [
        { type: 'value', name: '万吨', axisLabel: { formatter: (v: number) => v.toLocaleString() } },
        { type: 'value', name: '亿m³/亿kWh' },
      ],
      series: [
        {
          name: '煤炭', type: 'bar',
          data: [391403, 397452, 401915, 404860, 429576, 448246],
          itemStyle: { color: '#505050', borderRadius: [4, 4, 0, 0] },
        },
        {
          name: '原油', type: 'bar',
          data: [59402, 63004, 67268, 69477, 72299, 70023],
          itemStyle: { color: '#5470C6', borderRadius: [4, 4, 0, 0] },
        },
        {
          name: '天然气', type: 'bar', yAxisIndex: 1,
          data: [2393, 2817, 3059, 3339, 3747, 4006],
          itemStyle: { color: '#FAC858', borderRadius: [4, 4, 0, 0] },
        },
        {
          name: '电力', type: 'bar', yAxisIndex: 1,
          data: [65914, 71508, 74866, 77620, 85200, 88358],
          itemStyle: { color: '#91CC75', borderRadius: [4, 4, 0, 0] },
        },
      ],
    });
    instances.push(c);
  }

  // 图4：电力消费增长趋势
  if (chartElectricity.value) {
    const c = echarts.init(chartElectricity.value);
    c.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: '12%', right: '8%', bottom: '15%', top: '15%' },
      xAxis: { type: 'category', data: ['2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'] },
      yAxis: { type: 'value', name: '亿千瓦时', axisLabel: { formatter: (v: number) => v.toLocaleString() } },
      series: [{
        name: '电力消费', type: 'line',
        data: [61205, 65914, 68588, 72254, 76382, 83295, 86380, 92200, 94393],
        smooth: true,
        lineStyle: { width: 3, color: '#91CC75' },
        itemStyle: { color: '#91CC75' },
        areaStyle: { color: 'rgba(145,204,117,0.2)' },
        label: { show: true, position: 'top', fontSize: 9, color: '#91CC75' },
      }],
    });
    instances.push(c);
  }

  // 图5：天然气消费增长趋势
  if (chartGas.value) {
    const c = echarts.init(chartGas.value);
    c.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: '12%', right: '8%', bottom: '15%', top: '15%' },
      xAxis: { type: 'category', data: ['2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'] },
      yAxis: { type: 'value', name: '亿立方米', axisLabel: { formatter: (v: number) => v.toLocaleString() } },
      series: [{
        name: '天然气消费', type: 'line',
        data: [2078, 2193, 2393, 2766, 3070, 3693, 4039, 4347, 4747],
        smooth: true,
        lineStyle: { width: 3, color: '#FAC858' },
        itemStyle: { color: '#FAC858' },
        areaStyle: { color: 'rgba(250,200,88,0.2)' },
        label: { show: true, position: 'top', fontSize: 9, color: '#FAC858' },
      }],
    });
    instances.push(c);
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- 页面标题 -->
    <div
      class="relative rounded-xl overflow-hidden py-8 px-6"
      style="background-image: url('/bg/bg2.jpg'); background-size: cover; background-position: center;"
    >
      <div class="absolute inset-0 bg-gradient-to-r from-indigo-900/80 to-purple-800/60" />
      <div class="relative z-10">
        <h1 class="text-2xl font-bold text-white">⚡ 图表可视化</h1>
        <p class="text-indigo-100 mt-1">中国能源消费总量数据分析 · 数据来源：国家统计局 | 2016-2025年度数据</p>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <UCard>
        <div class="text-center">
          <div class="text-2xl font-bold text-indigo-600">61.7亿吨</div>
          <div class="text-xs text-gray-500 mt-1">2025年能源消费总量</div>
          <div class="text-xs text-red-500 mt-1">↑ 3.5% (较2024)</div>
        </div>
      </UCard>
      <UCard>
        <div class="text-center">
          <div class="text-2xl font-bold text-gray-700">51.4%</div>
          <div class="text-xs text-gray-500 mt-1">煤炭占比 (2025)</div>
          <div class="text-xs text-green-500 mt-1">↓ 持续下降</div>
        </div>
      </UCard>
      <UCard>
        <div class="text-center">
          <div class="text-2xl font-bold text-yellow-600">8.8%</div>
          <div class="text-xs text-gray-500 mt-1">天然气占比 (2024)</div>
          <div class="text-xs text-red-500 mt-1">↑ 持续增长</div>
        </div>
      </UCard>
      <UCard>
        <div class="text-center">
          <div class="text-2xl font-bold text-green-600">8.84万亿</div>
          <div class="text-xs text-gray-500 mt-1">电力消费量 (2024)</div>
          <div class="text-xs text-red-500 mt-1">↑ 6.8%</div>
        </div>
      </UCard>
    </div>

    <!-- 图表区域 -->
    <UCard>
      <template #header>
        <h3 class="font-semibold">📈 能源消费总量趋势 (2016-2025)</h3>
      </template>
      <div ref="chartLine" class="w-full h-[400px]" />
    </UCard>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <UCard>
        <template #header>
          <h3 class="font-semibold">🥧 能源消费结构占比 (2024)</h3>
        </template>
        <div ref="chartPie" class="w-full h-[380px]" />
      </UCard>

      <UCard>
        <template #header>
          <h3 class="font-semibold">🏭 主要能源消费品趋势</h3>
        </template>
        <div ref="chartBar" class="w-full h-[380px]" />
      </UCard>

      <UCard>
        <template #header>
          <h3 class="font-semibold">⚡ 电力消费量增长趋势</h3>
        </template>
        <div ref="chartElectricity" class="w-full h-[380px]" />
      </UCard>

      <UCard>
        <template #header>
          <h3 class="font-semibold">🔥 天然气消费量增长趋势</h3>
        </template>
        <div ref="chartGas" class="w-full h-[380px]" />
      </UCard>
    </div>

    <!-- 功能预告 -->
    <UAlert color="blue" title="功能规划" description="后续将支持用户上传自定义数据集、配置爬虫任务自动采集数据，并生成可交互的 ECharts 图表进行多维度分析。" />
  </div>
</template>
