<script setup lang="ts">
const { status, cancel } = useVectorizeTask();
const expanded = ref(false);

function toggleExpand() {
  expanded.value = !expanded.value;
}

const logsContainer = ref<HTMLElement | null>(null);

// 自动滚动到底部
watch(() => status.value.logs.length, () => {
  nextTick(() => {
    if (logsContainer.value) {
      logsContainer.value.scrollTop = logsContainer.value.scrollHeight;
    }
  });
});
</script>

<template>
  <div v-if="status.message" class="fixed bottom-4 right-4 z-50 max-w-lg">
    <!-- 展开的日志面板 -->
    <div
      v-if="expanded && status.running && status.logs.length > 0"
      class="mb-2 bg-gray-900 rounded-lg shadow-xl border border-gray-700 overflow-hidden"
    >
      <div class="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span class="text-xs text-gray-400">向量化队列 ({{ status.logs.length }} 条记录)</span>
        <button @click="expanded = false" class="text-gray-500 hover:text-gray-300 text-xs">收起</button>
      </div>
      <div ref="logsContainer" class="max-h-48 overflow-y-auto p-2 font-mono text-xs text-gray-300 space-y-0.5">
        <div v-for="(log, idx) in status.logs" :key="idx" class="text-gray-400">
          {{ log }}
        </div>
      </div>
    </div>

    <!-- 主状态栏 -->
    <div
      class="px-4 py-3 rounded-lg shadow-lg text-sm cursor-pointer"
      :class="status.running ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-100'"
      @click="toggleExpand"
    >
      <div class="flex items-center gap-2">
        <span v-if="status.running" class="inline-block animate-spin shrink-0">⟳</span>
        <span class="flex-1 truncate">{{ status.message }}</span>
        <button
          v-if="status.running"
          @click.stop="cancel"
          class="ml-2 shrink-0 text-xs px-2 py-1 rounded bg-white/20 hover:bg-white/30 transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  </div>
</template>
