<script setup lang="ts">
const { data: stats } = await useFetch('/api/stats');
</script>

<template>
  <div class="space-y-8">
    <div class="text-center py-12">
      <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-4">文章知识库</h1>
      <p class="text-lg text-gray-600 dark:text-gray-400">
        多渠道文章管理 · 向量化检索 · 智能问答
      </p>
    </div>

    <!-- 数据概览 -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4" v-if="stats">
      <UCard>
        <div class="text-center">
          <div class="text-3xl font-bold text-primary-600">{{ stats.totalArticles }}</div>
          <div class="text-sm text-gray-500 mt-1">文章总数</div>
        </div>
      </UCard>
      <UCard>
        <div class="text-center">
          <div class="text-3xl font-bold text-green-600">{{ stats.vectorizedArticles }}</div>
          <div class="text-sm text-gray-500 mt-1">已向量化</div>
        </div>
      </UCard>
      <UCard>
        <div class="text-center">
          <div class="text-3xl font-bold text-blue-600">{{ stats.totalSources }}</div>
          <div class="text-sm text-gray-500 mt-1">来源渠道</div>
        </div>
      </UCard>
      <UCard>
        <div class="text-center">
          <div class="text-3xl font-bold text-purple-600">{{ stats.totalChunks }}</div>
          <div class="text-sm text-gray-500 mt-1">知识片段</div>
        </div>
      </UCard>
    </div>

    <!-- 快捷入口 -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">智能问答</h3>
        </template>
        <p class="text-gray-600 dark:text-gray-400 mb-4">
          基于已收录文章的向量检索，智能回答你的问题
        </p>
        <UButton to="/qa" color="primary">开始提问</UButton>
      </UCard>
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">文章管理</h3>
        </template>
        <p class="text-gray-600 dark:text-gray-400 mb-4">
          浏览、搜索、导入文章，管理向量化状态
        </p>
        <UButton to="/admin" color="gray">进入管理</UButton>
      </UCard>
    </div>
  </div>
</template>
