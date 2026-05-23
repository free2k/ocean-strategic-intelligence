<script setup lang="ts">
const page = ref(1);
const search = ref('');
const searchInput = ref('');
const sourceType = ref('');
const filterStatus = ref('');

const { data: sourcesData } = await useFetch('/api/sources');

const { data, refresh } = await useFetch('/api/articles', {
  query: { page, search, pageSize: 20, sourceType, filterStatus },
  watch: [page, search, sourceType, filterStatus],
});

function doSearch() {
  search.value = searchInput.value;
  page.value = 1;
}

function resetFilters() {
  searchInput.value = '';
  search.value = '';
  sourceType.value = '';
  filterStatus.value = '';
  page.value = 1;
}

const filterStatusOptions = [
  { label: '全部状态', value: '' },
  { label: '待筛选', value: 'pending' },
  { label: '已通过', value: 'accepted' },
  { label: '已排除', value: 'rejected' },
];

const sourceTypeOptions = [
  { label: '全部渠道', value: '' },
  { label: '微信公众号', value: 'wechat' },
  { label: '网页', value: 'web' },
  { label: 'RSS', value: 'rss' },
  { label: '手动录入', value: 'manual' },
];

const statusColor: Record<string, string> = {
  pending: 'yellow',
  accepted: 'green',
  rejected: 'red',
};

const statusLabel: Record<string, string> = {
  pending: '待筛选',
  accepted: '已通过',
  rejected: '已排除',
};
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">文章列表</h1>
      <div class="text-sm text-gray-500" v-if="data">
        共 {{ data.total }} 篇文章
      </div>
    </div>

    <!-- 筛选栏 -->
    <UCard>
      <div class="flex flex-wrap items-center gap-3">
        <UInput v-model="searchInput" placeholder="搜索标题..." @keyup.enter="doSearch" class="w-48" />
        <UButton @click="doSearch" color="primary" size="sm">搜索</UButton>
        <USelect v-model="sourceType" :options="sourceTypeOptions" value-attribute="value" option-attribute="label" class="w-36" />
        <USelect v-model="filterStatus" :options="filterStatusOptions" value-attribute="value" option-attribute="label" class="w-32" />
        <UButton @click="resetFilters" color="gray" size="sm" variant="ghost">重置</UButton>
      </div>
    </UCard>

    <!-- 文章列表 -->
    <div v-if="data?.articles?.length" class="space-y-3">
      <UCard v-for="article in data.articles" :key="article.id" class="hover:shadow-md transition-shadow">
        <div class="flex gap-4">
          <img
            v-if="article.cover"
            :src="article.cover"
            :alt="article.title"
            class="w-20 h-20 object-cover rounded flex-shrink-0"
          />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <a :href="article.link" target="_blank" class="text-base font-medium text-gray-900 dark:text-white hover:text-primary-600 line-clamp-1 flex-1">
                {{ article.title }}
              </a>
              <UBadge :color="statusColor[article.filterStatus] || 'gray'" size="xs">
                {{ statusLabel[article.filterStatus] || article.filterStatus }}
              </UBadge>
            </div>
            <p v-if="article.digest" class="text-sm text-gray-500 mt-1 line-clamp-1">{{ article.digest }}</p>
            <div class="flex items-center gap-3 mt-2 text-xs text-gray-400">
              <UBadge color="blue" size="xs" variant="subtle">{{ article.sourceType }}</UBadge>
              <span v-if="article.sourceName">{{ article.sourceName }}</span>
              <span v-if="article.authorName">· {{ article.authorName }}</span>
              <span>{{ new Date(article.publishedAt).toLocaleDateString('zh-CN') }}</span>
              <UBadge v-if="article.vectorized" color="green" size="xs" variant="subtle">已向量化</UBadge>
              <span v-if="article.matchedTopic" class="text-primary-500">{{ article.matchedTopic }}</span>
            </div>
          </div>
        </div>
      </UCard>

      <div class="flex justify-center pt-4">
        <UPagination v-model="page" :total="data.total" :page-count="data.pageSize" />
      </div>
    </div>

    <div v-else class="text-center py-12 text-gray-500">
      暂无文章
    </div>
  </div>
</template>
