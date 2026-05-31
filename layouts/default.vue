<script setup lang="ts">
const route = useRoute();

const navItems = [
  { label: '首页', to: '/', exact: true, icon: '/icon/home.png' },
  { label: '文章抓取', to: '/wechat', icon: '/icon/claw.png' },
  { label: '文章列表', to: '/articles', icon: '/icon/articles.png' },
  { label: '数据抓取', to: '/scraper', icon: '/icon/outside.png' },
  { label: '图表可视化', to: '/charts', icon: '/icon/graph.png' },
  { label: '定期推送', to: '/export', icon: '/icon/send.png' },
  { label: '管理', to: '/admin', icon: '/icon/setting.png' },
];

function isNavActive(item: { to: string; exact?: boolean }): boolean {
  if (item.exact) return route.path === item.to;
  return route.path === item.to || route.path.startsWith(item.to + '/');
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <header class="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <NuxtLink to="/" class="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
            <img src="/favicon.png" alt="logo" class="w-7 h-7" />
            海洋能源资源情报分析
          </NuxtLink>
          <nav class="flex items-center gap-5">
            <NuxtLink
              v-for="item in navItems"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-2 text-base px-3 py-1.5 rounded transition-colors"
              :class="isNavActive(item)
                ? 'text-primary-600 dark:text-primary-400 font-semibold bg-primary-50 dark:bg-primary-900/30'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'"
            >
              <img :src="item.icon" :alt="item.label" class="w-5 h-5" />
              {{ item.label }}
            </NuxtLink>
          </nav>
        </div>
      </div>
    </header>
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <slot />
    </main>

    <!-- 全局浮动问答组件 -->
    <QAWidget />
  </div>
</template>
