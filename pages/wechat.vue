<script setup lang="ts">
const route=useRoute(),content=ref<HTMLElement>();
watch(()=>[route.path,route.query.view,route.query.page],async()=>{await nextTick();content.value?.scrollTo({top:0});});
</script>
<template>
  <div class="flex h-[calc(100vh-64px)]">
    <!-- 左侧导航栏 -->
    <aside class="w-14 md:w-56 border-r border-gray-200 dark:border-gray-700 flex flex-col shrink-0 bg-gray-50 dark:bg-gray-900">
      <WechatSideNav class="flex-1" />
    </aside>
    <!-- 右侧内容区 -->
    <main ref="content" class="flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-6 min-w-0">
      <NuxtPage />
    </main>
  </div>
</template>
