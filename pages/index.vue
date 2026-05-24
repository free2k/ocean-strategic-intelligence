<script setup lang="ts">
const { data: stats } = await useFetch('/api/stats');
</script>

<template>
  <div class="space-y-8">
    <!-- Hero 区域 - 使用背景图 -->
    <div
      class="relative rounded-2xl overflow-hidden py-16 px-8 text-center"
      style="background-image: url('/bg/bg1.jpg'); background-size: cover; background-position: center;"
    >
      <div class="absolute inset-0 bg-gradient-to-br from-blue-900/70 to-purple-900/60" />
      <div class="relative z-10">
        <h1 class="text-4xl font-bold text-white mb-4">海洋能源资源情报分析</h1>
        <p class="text-lg text-blue-100">
          多渠道文章管理 · 向量化检索 · 智能问答
        </p>
      </div>
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
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <UCard class="hover:shadow-lg transition-shadow">
        <template #header>
          <h3 class="text-lg font-semibold">📖 文章浏览</h3>
        </template>
        <p class="text-gray-600 dark:text-gray-400 mb-4">
          浏览、搜索、筛选已收录的文章，查看分类状态
        </p>
        <UButton to="/articles" color="primary" variant="soft">查看文章</UButton>
      </UCard>
      <UCard class="hover:shadow-lg transition-shadow">
        <template #header>
          <h3 class="text-lg font-semibold">⚙️ 后台管理</h3>
        </template>
        <p class="text-gray-600 dark:text-gray-400 mb-4">
          导入文章、抓取正文、向量化处理、过滤规则管理
        </p>
        <UButton to="/admin" color="gray">进入管理</UButton>
      </UCard>
      <UCard class="hover:shadow-lg transition-shadow">
        <template #header>
          <h3 class="text-lg font-semibold">📊 资讯导出</h3>
        </template>
        <p class="text-gray-600 dark:text-gray-400 mb-4">
          按时间和行业导出资讯摘要报告
        </p>
        <UButton to="/export" color="green" variant="soft">导出报告</UButton>
      </UCard>
    </div>

    <!-- 提示使用问答 -->
    <div class="text-center text-sm text-gray-500 dark:text-gray-400 py-4">
      💡 点击右下角的浮动按钮，随时使用智能问答功能
    </div>
  </div>
</template>
