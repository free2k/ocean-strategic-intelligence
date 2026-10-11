<script setup lang="ts">
import * as echarts from 'echarts'
import type { ChartItem } from '~/composables/useChartChat'

interface Props {
  option?: any | null
  chartList?: ChartItem[]
  selectedChartId?: string | null
}

interface Emits {
  (e: 'select', id: string): void
  (e: 'remove', id: string): void
}

const props = withDefaults(defineProps<Props>(), {
  option: null,
  chartList: () => [],
  selectedChartId: null,
})
const emit = defineEmits<Emits>()

const chartInstances = new Map<string, echarts.ECharts>()
const hasCharts = computed(() => props.chartList.length > 0)

function renderAllCharts() {
  for (const item of props.chartList) {
    const el = document.getElementById(`chart-panel-${item.id}`)
    if (!el) continue
    let instance = chartInstances.get(item.id)
    if (!instance) {
      instance = echarts.init(el)
      chartInstances.set(item.id, instance)
    }
    const option = { ...item.option }
    if (option.title && !option.grid) {
      option.grid = { top: 60 }
    }
    instance.clear()
    instance.setOption(option)
    instance.resize()
  }
  for (const [id, instance] of chartInstances.entries()) {
    if (!props.chartList.find(c => c.id === id)) {
      instance.dispose()
      chartInstances.delete(id)
    }
  }
}

watch(() => props.chartList, () => {
  nextTick(() => renderAllCharts())
}, { deep: true })

function resizeAll() {
  for (const instance of chartInstances.values()) {
    instance.resize()
  }
}

onMounted(() => {
  window.addEventListener('resize', resizeAll)
  if (props.chartList.length > 0) {
    nextTick(() => renderAllCharts())
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeAll)
  for (const instance of chartInstances.values()) {
    instance.dispose()
  }
  chartInstances.clear()
})

function exportPng() {
  const id = props.selectedChartId
  if (!id) return
  const instance = chartInstances.get(id)
  if (!instance) return
  const url = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
  const link = document.createElement('a')
  link.href = url
  link.download = `chart-${Date.now()}.png`
  link.click()
}

function exportHtml() {
  const id = props.selectedChartId
  if (!id) return
  const item = props.chartList.find(c => c.id === id)
  if (!item) return
  const optionJson = JSON.stringify(item.option)
  const lines = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <title>图表</title>',
    '  <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></scr' + 'ipt>',
    '  <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { background: #fff; } #chart { width: 100vw; height: 100vh; }</style>',
    '</head>',
    '<body>',
    '  <div id="chart"></div>',
    '  <script>',
    '    var chart = echarts.init(document.getElementById("chart"));',
    `    chart.setOption(${optionJson});`,
    '    window.addEventListener("resize", function() { chart.resize(); });',
    '  </scr' + 'ipt>',
    '</body>',
    '</html>',
  ]
  const html = lines.join('\n')
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `chart-${Date.now()}.html`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
      <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">
        图表预览
        <span v-if="chartList.length > 1" class="text-xs text-gray-400 ml-2">
          ({{ chartList.length }} 张，点击选中后可编辑)
        </span>
      </h3>
      <div class="flex gap-2">
        <UButton icon="i-heroicons-photo" size="sm" color="gray" variant="ghost" :disabled="!selectedChartId" @click="exportPng">
          导出 PNG
        </UButton>
        <UButton icon="i-heroicons-code-bracket" size="sm" color="gray" variant="ghost" :disabled="!selectedChartId" @click="exportHtml">
          导出 HTML
        </UButton>
      </div>
    </div>
    <div class="flex-1 relative overflow-y-auto p-4">
      <div v-if="!hasCharts" class="absolute inset-0 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
        <UIcon name="i-heroicons-chart-bar" class="text-5xl mb-3" />
        <p class="text-sm">上传数据并描述图表需求</p>
        <p class="text-xs mt-1">AI 将为你生成可视化图表，支持多图展示</p>
      </div>
      <div v-if="hasCharts" class="grid gap-4 h-full" :class="[chartList.length === 1 ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2']">
        <div
          v-for="item in chartList"
          :key="item.id"
          class="relative rounded-lg border-2 cursor-pointer transition-all min-h-[380px]"
          :class="selectedChartId === item.id ? 'border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'"
          @click="emit('select', item.id)"
        >
          <div class="absolute top-2 right-2 z-10 flex gap-1">
            <UBadge v-if="selectedChartId === item.id" color="primary" size="xs">编辑中</UBadge>
            <UButton icon="i-heroicons-x-mark" size="2xs" color="gray" variant="ghost" @click.stop="emit('remove', item.id)" />
          </div>
          <div :id="`chart-panel-${item.id}`" class="w-full h-full min-h-[360px]" />
        </div>
      </div>
    </div>
  </div>
</template>
