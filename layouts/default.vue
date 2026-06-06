<script setup lang="ts">
const route = useRoute();
const colorMode = useColorMode();

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';
}

const navItems = [
  { label: '首页', to: '/', exact: true, icon: '/icon/home.png' },
  { label: '资讯抓取', to: '/wechat', icon: '/icon/claw.png' },
  { label: '资讯过滤/清洗', to: '/articles', icon: '/icon/articles.png' },
  { label: '数据抓取&分析', to: '/scraper', icon: '/icon/outside.png' },
  { label: '定期推送', to: '/export', icon: '/icon/send.png' },
  { label: '知识库管理', to: '/admin', icon: '/icon/setting.png' },
];

function isNavActive(item: { to: string; exact?: boolean }): boolean {
  if (item.exact) return route.path === item.to;
  return route.path === item.to || route.path.startsWith(item.to + '/');
}

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' });
  navigateTo('/login');
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <header class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700/80 sticky top-0 z-40 shadow-sm dark:shadow-none">
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center h-14">
          <!-- 左侧: Logo + 主题切换 -->
          <div class="flex items-center gap-3 mr-6 shrink-0">
            <NuxtLink to="/" class="flex items-center gap-2">
              <img src="/favicon.png" alt="logo" class="w-7 h-7" />
              <span class="text-lg font-bold text-gray-900 dark:text-white hidden sm:inline">海洋能源资源情报分析</span>
            </NuxtLink>
            <div class="w-px h-5 bg-gray-200 dark:bg-gray-600" />
            <button
              class="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
              :title="colorMode.value === 'dark' ? '切换到亮色模式' : '切换到暗色模式'"
              @click="toggleTheme"
            >
              <UIcon
                :name="colorMode.value === 'dark' ? 'i-heroicons-moon' : 'i-heroicons-sun'"
                class="w-4.5 h-4.5 text-gray-500 dark:text-gray-400"
              />
            </button>
          </div>

          <!-- 导航菜单 -->
          <nav class="flex items-center gap-1 overflow-x-auto flex-1">
            <NuxtLink
              v-for="item in navItems"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-150"
              :class="isNavActive(item)
                ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700/50'"
            >
              <img :src="item.icon" :alt="item.label" class="w-4 h-4" />
              <span>{{ item.label }}</span>
            </NuxtLink>
          </nav>

          <!-- 登出 -->
          <button
            @click="logout"
            class="ml-3 shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            title="退出登录"
          >
            <UIcon name="i-heroicons-arrow-right-on-rectangle" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
    <main class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <slot />
    </main>

    <!-- 全局浮动问答组件 -->
    <QAWidget />
  </div>
</template>
