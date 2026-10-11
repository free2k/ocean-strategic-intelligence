<script setup lang="ts">
// 过滤规则已合并到管理后台，重定向
navigateTo('/admin');
</script>

<template>
  <div class="text-center py-12 text-gray-500">
    <p>过滤规则管理已合并到管理后台。</p>
    <UButton to="/admin" color="primary" class="mt-4">前往管理后台</UButton>
  </div>
</template>
