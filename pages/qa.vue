<script setup lang="ts">
// Q&A 功能已移至全局浮动组件，此页面重定向到首页
navigateTo('/');
</script>

<template>
  <div class="text-center py-12 text-gray-500">
    <p>智能问答功能已移至右下角浮动组件，可在任意页面使用。</p>
    <UButton to="/" color="primary" class="mt-4">返回首页</UButton>
  </div>
</template>
