<script setup lang="ts">
definePageMeta({ layout: false });

const password = ref('');
const loading = ref(false);
const error = ref('');

async function login() {
  if (!password.value) return;
  loading.value = true;
  error.value = '';
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { password: password.value },
    });
    await navigateTo('/');
  } catch (e: any) {
    error.value = e.data?.message || '登录失败';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-900">
    <div class="w-full max-w-sm p-8">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-white">海洋能源资源情报分析</h1>
        <p class="text-gray-400 mt-2 text-sm">请输入访问密码</p>
      </div>

      <form @submit.prevent="login" class="space-y-4">
        <div>
          <input
            v-model="password"
            type="password"
            placeholder="访问密码"
            autofocus
            class="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
          />
        </div>

        <p v-if="error" class="text-red-400 text-sm text-center">{{ error }}</p>

        <button
          type="submit"
          :disabled="loading || !password"
          class="w-full py-3 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium transition-colors"
        >
          {{ loading ? '验证中...' : '进入系统' }}
        </button>
      </form>

      <p class="text-center text-gray-600 text-xs mt-8">仅限授权人员访问</p>
    </div>
  </div>
</template>
