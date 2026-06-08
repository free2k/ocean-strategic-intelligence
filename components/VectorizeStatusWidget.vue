<script setup lang="ts">
const { status, cancel } = useVectorizeTask();
</script>

<template>
  <div
    v-if="status.message"
    class="fixed bottom-4 right-4 z-50 max-w-md px-4 py-3 rounded-lg shadow-lg text-sm"
    :class="status.running ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-100'"
  >
    <div class="flex items-center gap-2">
      <span v-if="status.running" class="inline-block animate-spin shrink-0">⟳</span>
      <span class="flex-1 truncate">{{ status.message }}</span>
      <button
        v-if="status.running"
        @click="cancel"
        class="ml-2 shrink-0 text-xs px-2 py-1 rounded bg-white/20 hover:bg-white/30 transition-colors"
      >
        取消
      </button>
    </div>
  </div>
</template>
