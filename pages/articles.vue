<script setup lang="ts">
const page = ref(1);
const search = ref('');
const searchInput = ref('');
const sourceType = ref('');
const sourceId = ref('');
const filterStatus = ref('');
const matchedTopic = ref('');
const dateRange = ref('');

const { data: sourcesData } = await useFetch('/api/sources');
const { data: topicsData, refresh: refreshTopics } = await useFetch('/api/topics');

const { data, refresh } = await useFetch('/api/articles', {
  query: { page, search, pageSize: 20, sourceType, sourceId, filterStatus, matchedTopic, dateRange },
  watch: [page, search, sourceType, sourceId, filterStatus, matchedTopic, dateRange],
});

function doSearch() {
  search.value = searchInput.value;
  page.value = 1;
}

function resetFilters() {
  searchInput.value = '';
  search.value = '';
  sourceType.value = '';
  sourceId.value = '';
  filterStatus.value = '';
  matchedTopic.value = '';
  dateRange.value = '';
  page.value = 1;
}

// 当切换渠道时重置公众号选择
watch(sourceType, () => {
  sourceId.value = '';
  page.value = 1;
});

const filterStatusOptions = [
  { label: '全部状态', value: '' },
  { label: '待筛选', value: 'pending' },
  { label: '已通过', value: 'accepted' },
  { label: '已排除', value: 'rejected' },
];

const sourceTypeOptions = [
  { label: '全部渠道', value: '' },
  { label: '微信公众号', value: 'wechat' },
  { label: 'RSS', value: 'rss' },
  { label: '网页', value: 'web' },  
  { label: '手动录入', value: 'manual' },
];

const dateRangeOptions = [
  { label: '全部时间', value: '' },
  { label: '最近1周', value: '1w' },
  { label: '最近2周', value: '2w' },
  { label: '最近1个月', value: '1m' },
  { label: '最近3个月', value: '3m' },
  { label: '最近6个月', value: '6m' },
  { label: '最近1年', value: '1y' },
];

// 微信公众号列表（用于二级筛选）
const wechatSources = computed(() => {
  const list = sourcesData.value?.sources?.filter(s => s.type === 'wechat') || [];
  return [{ label: '全部公众号', value: '' }, ...list.map(s => ({ label: s.name, value: String(s.id) }))];
});

// 分类主题列表（用于筛选）
const topicOptions = computed(() => {
  const list = topicsData.value?.topics || [];
  return [{ label: '全部分类', value: '' }, ...list.map(t => ({ label: `${t.name} (${t.articleCount})`, value: t.name }))];
});

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

const methodLabel: Record<string, string> = {
  keyword: '关键词匹配',
  llm: 'LLM语义分类',
};

async function removeVector(articleId: number) {
  if (!confirm('确定从知识库中移除此文章的向量数据？')) return;
  try {
    await $fetch('/api/articles/remove-vector', {
      method: 'POST',
      body: { articleIds: [articleId] },
    });
    refresh();
  } catch (e: any) {
    alert(e.data?.message || '移除失败');
  }
}

const vectorizingId = ref<number | null>(null);

async function vectorizeOne(articleId: number) {
  vectorizingId.value = articleId;
  try {
    await $fetch('/api/articles/vectorize', {
      method: 'POST',
      body: { articleIds: [articleId] },
    });
    refresh();
  } catch (e: any) {
    alert(e.data?.message || '向量化失败');
  } finally {
    vectorizingId.value = null;
  }
}

// 导出总结
const exportLoading = ref(false);
const exportCountLoading = ref(false);
const exportCount = ref<number | null>(null);
const showExportConfirm = ref(false);
const exportFormat = ref('markdown');
const exportProgress = ref(0);
const exportTotal = ref(0);
const exportCurrentTitle = ref('');

const formatOptions = [
  { label: 'Markdown', value: 'markdown' },
  { label: 'Word 文档 (.docx)', value: 'docx' },
];

// 分类规则弹窗
const showRulesModal = ref(false);

// 打开规则弹窗
function openRulesModal() {
  showRulesModal.value = true;
}

// 规则变更后刷新分类列表和文章
async function onRulesChanged() {
  await refreshTopics();
  await refresh();
}

// 获取可导出文章数量
async function previewExportCount() {
  exportCountLoading.value = true;
  try {
    const res = await $fetch('/api/articles/export-count', {
      method: 'POST',
      body: {
        topic: matchedTopic.value || undefined,
        dateRange: dateRange.value || undefined,
        sourceType: sourceType.value || undefined,
        sourceId: sourceId.value ? Number(sourceId.value) : undefined,
        filterStatus: filterStatus.value || 'accepted',
      },
    });
    exportCount.value = res.count;
    showExportConfirm.value = true;
  } catch (e: any) {
    alert(e.data?.message || '查询失败');
  } finally {
    exportCountLoading.value = false;
  }
}

async function confirmExport() {
  showExportConfirm.value = false;
  exportLoading.value = true;
  exportProgress.value = 0;
  exportTotal.value = 0;
  exportCurrentTitle.value = '';

  const filterParams = {
    topic: matchedTopic.value || undefined,
    dateRange: dateRange.value || undefined,
    sourceType: sourceType.value || undefined,
    sourceId: sourceId.value ? Number(sourceId.value) : undefined,
    filterStatus: filterStatus.value || 'accepted',
  };

  try {
    if (exportFormat.value === 'docx') {
      // Word 导出使用流式进度
      const response = await fetch('/api/articles/export-docx-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filterParams),
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let docxBase64 = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'start') {
              exportTotal.value = data.total;
            } else if (data.type === 'progress') {
              exportProgress.value = data.current;
              exportTotal.value = data.total;
              exportCurrentTitle.value = data.title;
            } else if (data.type === 'done') {
              docxBase64 = data.base64;
            }
          } catch {}
        }
      }

      if (docxBase64) {
        const binary = atob(docxBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `信息资讯推送.docx`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } else {
      // Markdown 导出使用 SSE 流式进度
      const response = await fetch('/api/articles/export-summary-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filterParams),
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let resultContent = '';
      let resultFilename = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'start') {
              exportTotal.value = data.total;
            } else if (data.type === 'progress') {
              exportProgress.value = data.current;
              exportTotal.value = data.total;
              exportCurrentTitle.value = data.title;
            } else if (data.type === 'done') {
              resultContent = data.content;
              resultFilename = data.filename;
            }
          } catch {}
        }
      }

      if (resultContent) {
        const blob = new Blob([resultContent], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = resultFilename;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  } catch (e: any) {
    alert(e.data?.message || e.message || '导出失败');
  } finally {
    exportLoading.value = false;
    exportProgress.value = 0;
    exportTotal.value = 0;
    exportCurrentTitle.value = '';
  }
}

function cancelExport() {
  showExportConfirm.value = false;
  exportCount.value = null;
}
</script>

<template>
  <div class="space-y-6">
    <!-- 页面标题带背景 -->
    <div
      class="relative rounded-xl overflow-hidden py-6 px-6 mb-2"
      style="background-image: url('/bg/bg1.jpg'); background-size: cover; background-position: center bottom;"
    >
      <div class="absolute inset-0 bg-gradient-to-r from-blue-900/75 to-indigo-800/60" />
      <div class="relative z-10 flex items-center justify-between">
        <h1 class="text-2xl font-bold text-white">文章列表</h1>
        <div class="flex items-center gap-3">
        <UButton @click="openRulesModal" color="blue" variant="soft" size="sm" icon="i-heroicons-funnel">
          分类规则
        </UButton>
        <UButton @click="previewExportCount" :loading="exportCountLoading || exportLoading" color="green" size="sm">
          导出总结
        </UButton>
        <span class="text-sm text-blue-100" v-if="data">共 {{ data.total }} 篇</span>
        </div>
      </div>
    </div>

    <!-- 筛选栏 -->
    <UCard>
      <div class="flex flex-wrap items-center gap-3">
        <UInput v-model="searchInput" placeholder="搜索标题..." @keyup.enter="doSearch" class="w-48" />
        <UButton @click="doSearch" color="primary" size="sm">搜索</UButton>
        <USelect v-model="dateRange" :options="dateRangeOptions" value-attribute="value" option-attribute="label" class="w-32" />
        <USelect v-model="sourceType" :options="sourceTypeOptions" value-attribute="value" option-attribute="label" class="w-36" />
        <USelect v-if="sourceType === 'wechat'" v-model="sourceId" :options="wechatSources" value-attribute="value" option-attribute="label" class="w-40" />
        <USelect v-model="filterStatus" :options="filterStatusOptions" value-attribute="value" option-attribute="label" class="w-32" />
        <USelect v-model="matchedTopic" :options="topicOptions" value-attribute="value" option-attribute="label" class="w-48" />
        <UButton @click="resetFilters" color="gray" size="sm" variant="ghost">重置</UButton>
      </div>
    </UCard>

    <!-- 文章列表 -->
    <div v-if="data?.articles?.length" class="space-y-3">
      <UCard v-for="article in data.articles" :key="article.id" class="hover:shadow-md transition-shadow">
        <div class="flex items-center gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <a :href="article.link" target="_blank" class="text-base font-medium text-gray-900 dark:text-white hover:text-primary-600 line-clamp-1 flex-1">
                {{ article.title }}
              </a>
              <UTooltip :text="article.rejectReason || ''" :prevent="!article.rejectReason">
                <UBadge :color="statusColor[article.filterStatus] || 'gray'" size="xs">
                  {{ statusLabel[article.filterStatus] || article.filterStatus }}
                </UBadge>
              </UTooltip>
            </div>
            <p v-if="article.digest" class="text-sm text-gray-500 mt-1 line-clamp-1">{{ article.digest }}</p>
            <div class="flex items-center gap-3 mt-2 text-xs text-gray-400">
              <UBadge color="blue" size="xs" variant="subtle">{{ article.sourceType }}</UBadge>
              <span v-if="article.sourceName">{{ article.sourceName }}</span>
              <span v-if="article.authorName">· {{ article.authorName }}</span>
              <span>{{ new Date(article.publishedAt).toLocaleDateString('zh-CN') }}</span>
              <UBadge v-if="article.vectorized" color="green" size="xs" variant="subtle">已向量化</UBadge>
              <UButton v-if="article.vectorized" @click="removeVector(article.id)" size="xs" color="red" variant="ghost" class="ml-1">移除向量</UButton>
              <UButton v-if="!article.vectorized" @click="vectorizeOne(article.id)" :loading="vectorizingId === article.id" size="xs" color="green" variant="ghost" class="ml-1">向量化</UButton>
            </div>
            <!-- 分类信息 -->
            <div v-if="article.matchedTopic" class="flex items-center gap-2 mt-2">
              <span class="text-sm font-medium text-primary-500 cursor-pointer hover:text-primary-600" @click="matchedTopic = article.matchedTopic">{{ article.matchedTopic }}</span>
              <span v-if="article.classifyMethod" class="text-[11px] text-gray-400">({{ methodLabel[article.classifyMethod] || article.classifyMethod }})</span>
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

    <!-- 导出确认弹窗 -->
    <UModal v-model="showExportConfirm">
      <UCard>
        <template #header>
          <h3 class="font-semibold text-lg">确认导出</h3>
        </template>
        <div class="space-y-3">
          <p class="text-gray-700 dark:text-gray-300">
            当前筛选条件下共有 <span class="text-primary-600 font-bold text-lg">{{ exportCount }}</span> 篇文章可导出。
          </p>
          <p class="text-sm text-gray-500">
            每篇文章将生成约 400 字的摘要总结，按行业分类分组输出。
          </p>
          <div class="flex items-center gap-3 pt-2">
            <label class="text-sm text-gray-600 dark:text-gray-400">导出格式</label>
            <USelect v-model="exportFormat" :options="formatOptions" value-attribute="value" option-attribute="label" class="w-48" />
          </div>
        </div>
        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton @click="cancelExport" color="gray" variant="ghost">取消</UButton>
            <UButton @click="confirmExport" :loading="exportLoading" color="green">
              确认导出 {{ exportCount }} 篇
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- 导出进度弹窗 -->
    <UModal v-model="exportLoading" :prevent-close="true">
      <UCard>
        <template #header>
          <h3 class="font-semibold text-lg">正在生成摘要...</h3>
        </template>
        <div class="space-y-4">
          <div class="flex justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>进度</span>
            <span>{{ exportProgress }} / {{ exportTotal }}</span>
          </div>
          <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
            <div
              class="bg-green-500 h-2.5 rounded-full transition-all duration-300"
              :style="{ width: exportTotal > 0 ? `${(exportProgress / exportTotal) * 100}%` : '0%' }"
            />
          </div>
          <div v-if="exportCurrentTitle" class="text-sm text-gray-500 truncate">
            <span class="text-gray-400">正在处理：</span>{{ exportCurrentTitle }}
          </div>
        </div>
      </UCard>
    </UModal>

    <!-- 分类规则弹窗 -->
    <UModal v-model="showRulesModal" :ui="{ width: 'sm:max-w-4xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-lg">分类规则管理</h3>
            <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" size="sm" @click="showRulesModal = false" />
          </div>
        </template>
        <div class="max-h-[70vh] overflow-y-auto">
          <AdminFiltersTab @changed="onRulesChanged" />
        </div>
      </UCard>
    </UModal>
  </div>
</template>
