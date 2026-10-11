<script setup lang="ts">
const route = useRoute();
const isMobileMenuOpen = ref(false);

const navItems = [
  { label: '公众号与 X 订阅', icon: 'i-heroicons-user-group', to: '/wechat/subscriptions' },
  { label: '已入库文章', icon: 'i-heroicons-document-text', to: '/articles' },
  { label: 'RSS 订阅', icon: 'i-heroicons-rss', to: '/wechat/rss' },
];

function isActive(to: string): boolean {
  return route.path === to || route.path.startsWith(to + '/');
}
</script>

<template>
  <!-- Mobile hamburger button -->
  <div class="md:hidden fixed top-3 left-3 z-50">
    <UButton
      :icon="isMobileMenuOpen ? 'i-heroicons-x-mark' : 'i-heroicons-bars-3'"
      variant="ghost"
      color="gray"
      size="lg"
      aria-label="切换导航菜单"
      @click="isMobileMenuOpen = !isMobileMenuOpen"
    />
  </div>

  <!-- Navigation -->
  <nav
    class="py-4 px-3 space-y-1"
    :class="{ 'hidden md:block': !isMobileMenuOpen }"
  >
    <NuxtLink
      v-for="item in navItems"
      :key="item.to"
      :to="item.to"
      class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
      :class="isActive(item.to)
        ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'"
      @click="isMobileMenuOpen = false"
    >
      <UIcon :name="item.icon" class="w-5 h-5 shrink-0" />
      <span>{{ item.label }}</span>
    </NuxtLink>
  </nav>
</template>
