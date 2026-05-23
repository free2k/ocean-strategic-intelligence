<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <header class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <NuxtLink to="/" class="text-xl font-bold text-gray-900 dark:text-white">
            📚 知识库
          </NuxtLink>
          <nav class="flex items-center gap-4">
            <NuxtLink to="/" class="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300">
              首页
            </NuxtLink>
            <NuxtLink to="/articles" class="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300">
              文章
            </NuxtLink>
            <NuxtLink to="/filters" class="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300">
              过滤规则
            </NuxtLink>
            <NuxtLink to="/qa" class="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300">
              问答
            </NuxtLink>
            <NuxtLink to="/admin" class="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300">
              管理
            </NuxtLink>
          </nav>
        </div>
      </div>
    </header>
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <slot />
    </main>
  </div>
</template>
