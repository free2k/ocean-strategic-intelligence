<script setup lang="ts">
import * as echarts from 'echarts'

interface Props {
  option: any | null
}

const props = defineProps<Props>()

const chartContainer = ref<HTMLElement | null>(null)
let chartInstance: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const hasChart = computed(() => !!props.option)

// Initialize chart on mount
onMounted(() => {
  if (chartContainer.value) {
    chartInstance = echarts.init(chartContainer.value)

    // Set initial option if provided
    if (props.option) {
      chartInstance.setOption(props.option)
    }

    // Setup ResizeObserver for responsive resize
    resizeObserver = new ResizeObserver(() => {
      chartInstance?.resize()
    })
    resizeObserver.observe(chartContainer.value)
  }
})

// Watch option prop changes and update chart
watch(
  () => props.option,
  (newOption) => {
    if (!chartInstance) return
    if (newOption) {
      // Clear previous option and set new one
      chartInstance.clear()
      chartInstance.setOption(newOption)
    }
    else {
      chartInstance.clear()
    }
  },
)

// Cleanup on unmount
onUnmounted(() => {
  resizeObserver?.disconnect()
  chartInstance?.dispose()
  chartInstance = null
})

// Export as PNG
function exportPng() {
  if (!chartInstance) return
  const url = chartInstance.getDataURL({
    type: 'png',
    pixelRatio: 2,
    backgroundColor: '#fff',
  })
  const link = document.createElement('a')
  link.href = url
  link.download = `chart-${Date.now()}.png`
  link.click()
}

// Export as JSON
function exportJson() {
  if (!props.option) return
  const json = JSON.stringify(props.option, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `chart-config-${Date.now()}.json`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Export buttons -->
    <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
      <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">
        图表预览
      </h3>
      <div class="flex gap-2">
        <UButton
          icon="i-heroicons-photo"
          size="sm"
          color="gray"
          variant="ghost"
          :disabled="!hasChart"
          @click="exportPng"
        >
          导出 PNG
        </UButton>
        <UButton
          icon="i-heroicons-code-bracket"
          size="sm"
          color="gray"
          variant="ghost"
          :disabled="!hasChart"
          @click="exportJson"
        >
          导出 JSON
        </UButton>
      </div>
    </div>

    <!-- Chart area -->
    <div class="flex-1 relative">
      <!-- Empty state -->
      <div
        v-if="!hasChart"
        class="absolute inset-0 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500"
      >
        <UIcon name="i-heroicons-chart-bar" class="text-5xl mb-3" />
        <p class="text-sm">上传数据并描述图表需求</p>
        <p class="text-xs mt-1">AI 将为你生成可视化图表</p>
      </div>

      <!-- ECharts container -->
      <div
        ref="chartContainer"
        class="w-full h-full min-h-[400px]"
        :class="{ 'opacity-0': !hasChart }"
      />
    </div>
  </div>
</template>
