<script setup lang="ts">
// --- 当前 Tab ---
const activeTab = ref(0);
const isOverseas = computed(() => activeTab.value === 1);

// --- 筛选状态 ---
const page = ref(1);
const search = ref('');
const searchInput = ref('');
const sourceType = ref('');
const sourceId = ref('');
const filterStatus = ref('');
const matchedTopic = ref('');
const dateRange = ref('');

const { data: sourcesData } = await useFetch('/api/sources');
const { data: topicsData, refresh: refreshTopics } = await useFetch('/api/topics', {
  query: computed(() => ({
    overseas: isOverseas.value ? 'true' : 'false',
    sourceType: sourceType.value || undefined,
    sourceId: sourceId.value || undefined,
    dateRange: dateRange.value || undefined,
  })),
  watch: [activeTab, sourceType, sourceId, dateRange],
});

const { data, refresh } = await useFetch('/api/articles', {
  query: computed(() => ({
    page: page.value,
    search: search.value,
    pageSize: 20,
    sourceType: sourceType.value,
    sourceId: sourceId.value,
    filterStatus: filterStatus.value,
    matchedTopic: matchedTopic.value,
    dateRange: dateRange.value,
    overseas: isOverseas.value ? 'true' : 'false',
  })),
  watch: [page, search, sourceType, sourceId, filterStatus, matchedTopic, dateRange, activeTab],
});

// 切换 tab 时重置筛选
watch(activeTab, () => {
  page.value = 1;
  search.value = '';
  searchInput.value = '';
  sourceType.value = '';
  sourceId.value = '';
  filterStatus.value = '';
  matchedTopic.value = '';
  dateRange.value = '';
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

watch(sourceType, () => {
  sourceId.value = '';
  matchedTopic.value = '';
  page.value = 1;
});

watch(matchedTopic, () => {
  page.value = 1;
});

watch(filterStatus, () => {
  page.value = 1;
});

const filterStatusOptions = [
  { label: '全部状态', value: '' },
  { label: '待筛选', value: 'pending' },
  { label: '已通过', value: 'accepted' },
  { label: '已排除', value: 'rejected' },
  { label: '已人工标注', value: 'manual' },
];

const sourceTypeOptions = [
  { label: '全部渠道', value: '' },
  { label: '微信公众号', value: 'wechat' },
  { label: 'RSS', value: 'rss' },
  // { label: '网页', value: 'web' },
  // { label: '手动录入', value: 'manual' },
];

const dateRangeOptions = [
  { label: '全部时间', value: '' },
  { label: '最近3天', value: '3d' },
  { label: '最近1周', value: '1w' },
  { label: '最近2周', value: '2w' },
  { label: '最近1个月', value: '1m' },
  { label: '最近3个月', value: '3m' },
  { label: '最近6个月', value: '6m' },
  { label: '最近1年', value: '1y' },
];

const wechatSources = computed(() => {
  const list = sourcesData.value?.sources?.filter(s => s.type === 'wechat' && s.isOverseas === isOverseas.value) || [];
  return [{ label: '全部公众号', value: '' }, ...list.map(s => ({ label: s.name, value: String(s.id) }))];
});

const topicOptions = computed(() => {
  const list = (topicsData.value?.topics || []).filter(t => t.name !== '外网资讯');
  return [{ label: '全部分类', value: '' }, ...list.map(t => ({ label: `${t.name} (${t.articleCount})`, value: t.name }))];
});

const statusColor: Record<string, string> = { pending: 'yellow', accepted: 'green', rejected: 'red' };
const statusLabel: Record<string, string> = { pending: '待筛选', accepted: '已通过', rejected: '已排除' };
const methodLabel: Record<string, string> = { keyword: '关键词匹配', llm: 'LLM语义分类', manual: '人工标注' };

// --- 人工标注分类 ---
const manualClassifyId = ref<number | null>(null);
const manualClassifyTopic = ref('');
const manualClassifyLoading = ref(false);

// 从 filter_rules 获取所有正向规则的 topic 作为可选分类
const { data: filterRulesData } = await useFetch('/api/filters');
const classifyTopicOptions = computed(() => {
  const rules = (filterRulesData.value as any)?.rules || [];
  const includeRules = Array.isArray(rules) ? rules.filter((r: any) => r.type === 'include' && r.topic) : [];
  const options = includeRules.map((r: any) => ({ label: r.topic, value: r.topic }));
  // 添加"排除（不匹配任何分类）"选项
  options.push({ label: '── 排除（不属于任何行业）', value: '__reject__' });
  return options;
});

function openManualClassify(articleId: number, currentTopic?: string | null) {
  manualClassifyId.value = articleId;
  manualClassifyTopic.value = currentTopic || '';
}

async function submitManualClassify() {
  if (!manualClassifyId.value || !manualClassifyTopic.value) return;
  manualClassifyLoading.value = true;
  try {
    if (manualClassifyTopic.value === '__reject__') {
      await $fetch('/api/articles/manual-classify', {
        method: 'POST',
        body: { articleIds: [manualClassifyId.value], topic: '__reject__' },
      });
    } else {
      await $fetch('/api/articles/manual-classify', {
        method: 'POST',
        body: { articleIds: [manualClassifyId.value], topic: manualClassifyTopic.value },
      });
    }
    manualClassifyId.value = null;
    manualClassifyTopic.value = '';
    await refreshTopics();
    refresh();
  } catch (e: any) { alert(e.data?.message || '标注失败'); }
  finally { manualClassifyLoading.value = false; }
}

async function clearManualClassify(articleId: number) {
  if (!confirm('确定清除人工标注？文章将恢复为待筛选状态。')) return;
  try {
    await $fetch('/api/articles/manual-classify', {
      method: 'POST',
      body: { articleIds: [articleId], clear: true },
    });
    await refreshTopics();
    refresh();
  } catch (e: any) { alert(e.data?.message || '清除失败'); }
}

async function removeVector(articleId: number) {
  if (!confirm('确定从知识库中移除此文章的向量数据？')) return;
  try {
    await $fetch('/api/articles/remove-vector', { method: 'POST', body: { articleIds: [articleId] } });
    refresh();
  } catch (e: any) { alert(e.data?.message || '移除失败'); }
}

const vectorizingId = ref<number | null>(null);
async function vectorizeOne(articleId: number) {
  vectorizingId.value = articleId;
  try {
    await $fetch('/api/articles/vectorize', { method: 'POST', body: { articleIds: [articleId] } });
    refresh();
  } catch (e: any) { alert(e.data?.message || '向量化失败'); }
  finally { vectorizingId.value = null; }
}

const downloadingId = ref<number | null>(null);
async function downloadContent(articleId: number) {
  downloadingId.value = articleId;
  try {
    await $fetch('/api/articles/download-content', { method: 'POST', body: { articleId } });
    refresh();
  } catch (e: any) { alert(e.data?.message || '下载失败'); }
  finally { downloadingId.value = null; }
}

// --- 导出 ---
const exportLoading = ref(false);
const exportCountLoading = ref(false);
const exportCount = ref<number | null>(null);
const showExportConfirm = ref(false);
const exportFormat = ref('markdown');
const exportProgress = ref(0);
const exportTotal = ref(0);
const exportCurrentTitle = ref('');
const exportIncludeDomestic = ref(true);
const exportIncludeOverseas = ref(true);

const formatOptions = [
  { label: 'Markdown', value: 'markdown' },
  { label: 'Word 文档 (.docx)', value: 'docx' },
];

// 分类规则弹窗
const showRulesModal = ref(false);
function openRulesModal() { showRulesModal.value = true; }
async function onRulesChanged() { await refreshTopics(); await refresh(); }

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
        overseas: isOverseas.value ? 'true' : 'false',
      },
    });
    exportCount.value = res.count;
    // 默认根据当前 tab 设置导出范围
    exportIncludeDomestic.value = !isOverseas.value;
    exportIncludeOverseas.value = isOverseas.value;
    showExportConfirm.value = true;
  } catch (e: any) { alert(e.data?.message || '查询失败'); }
  finally { exportCountLoading.value = false; }
}

// 勾选导出范围变化时重新查询数量
async function refreshExportCount() {
  if (!showExportConfirm.value) return;
  let overseas: string | undefined;
  if (exportIncludeDomestic.value && !exportIncludeOverseas.value) overseas = 'false';
  else if (!exportIncludeDomestic.value && exportIncludeOverseas.value) overseas = 'true';
  // 两个都选或都不选时不传 overseas

  try {
    const res = await $fetch('/api/articles/export-count', {
      method: 'POST',
      body: {
        topic: matchedTopic.value || undefined,
        dateRange: dateRange.value || undefined,
        sourceType: sourceType.value || undefined,
        sourceId: sourceId.value ? Number(sourceId.value) : undefined,
        filterStatus: filterStatus.value || 'accepted',
        overseas,
      },
    });
    exportCount.value = res.count;
  } catch {}
}

watch([exportIncludeDomestic, exportIncludeOverseas], () => {
  refreshExportCount();
});

async function confirmExport() {
  showExportConfirm.value = false;
  exportLoading.value = true;
  exportProgress.value = 0;
  exportTotal.value = 0;
  exportCurrentTitle.value = '';

  const filterParams: Record<string, any> = {
    topic: matchedTopic.value || undefined,
    dateRange: dateRange.value || undefined,
    sourceType: sourceType.value || undefined,
    sourceId: sourceId.value ? Number(sourceId.value) : undefined,
    filterStatus: filterStatus.value || 'accepted',
  };

  // 根据勾选决定导出范围
  if (exportIncludeDomestic.value && !exportIncludeOverseas.value) {
    filterParams.overseas = 'false';
  } else if (!exportIncludeDomestic.value && exportIncludeOverseas.value) {
    filterParams.overseas = 'true';
  }
  // 两个都勾选则不传 overseas 参数（导出全部）

  try {
    if (exportFormat.value === 'docx') {
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
            if (data.type === 'start') exportTotal.value = data.total;
            else if (data.type === 'progress') { exportProgress.value = data.current; exportTotal.value = data.total; exportCurrentTitle.value = data.title; }
            else if (data.type === 'done') docxBase64 = data.base64;
          } catch {}
        }
      }
      if (docxBase64) {
        const binary = atob(docxBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        const filename = `信息资讯推送.docx`;
        // 兼容下载管理器：将 a 标签加入 DOM 并延迟清理
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        a.setAttribute('download', filename);
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 1000);
      }
    } else {
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
            if (data.type === 'start') exportTotal.value = data.total;
            else if (data.type === 'progress') { exportProgress.value = data.current; exportTotal.value = data.total; exportCurrentTitle.value = data.title; }
            else if (data.type === 'done') { resultContent = data.content; resultFilename = data.filename; }
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
  } catch (e: any) { alert(e.data?.message || e.message || '导出失败'); }
  finally { exportLoading.value = false; exportProgress.value = 0; exportTotal.value = 0; exportCurrentTitle.value = ''; }
}

function cancelExport() { showExportConfirm.value = false; exportCount.value = null; }


</script>

<template>
  <div class="space-y-6">
    <!-- 页面标题 -->
    <div
      class="relative rounded-xl overflow-hidden py-6 px-6 mb-2"
      style="background-image: url('/bg/bg1.jpg'); background-size: cover; background-position: center bottom;"
    >
      <div class="absolute inset-0 bg-gradient-to-r from-blue-900/75 to-indigo-800/60" />
      <div class="relative z-10 flex items-center justify-between">
        <h1 class="text-2xl font-bold text-white">文章列表</h1>
        <div class="flex items-center gap-3">
          <UButton @click="openRulesModal" color="orange" variant="soft" size="sm" icon="i-heroicons-funnel">分类规则</UButton>

          <UButton @click="previewExportCount" :loading="exportCountLoading || exportLoading" color="green" size="sm">导出当前行业总结</UButton>
        </div>
      </div>
    </div>

    <!-- Tab 切换：国内资讯 / 外网资讯 -->
    <div class="flex border-b border-gray-200 dark:border-gray-700">
      <button
        class="flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2"
        :class="activeTab === 0
          ? 'border-primary-500 text-primary-600 dark:text-primary-400'
          : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
        @click="activeTab = 0"
      >
        <img src="/icon/inside.png" alt="国内" class="w-5 h-5" />
        国内资讯
      </button>
      <button
        class="flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2"
        :class="activeTab === 1
          ? 'border-primary-500 text-primary-600 dark:text-primary-400'
          : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
        @click="activeTab = 1"
      >
        <img src="/icon/outside.png" alt="外网" class="w-5 h-5" />
        外网资讯
      </button>
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
        <UButton @click="resetFilters" color="gray" size="sm" variant="ghost">重置</UButton>
        <span class="text-sm text-gray-500 dark:text-gray-400 ml-auto" v-if="data">共 {{ data.total }} 篇</span>
      </div>
    </UCard>

    <!-- 分类标签筛选（仅"已通过"状态时展示） -->
    <div v-if="filterStatus === 'accepted'" class="flex items-center gap-2 flex-wrap">
      <span class="text-xs text-gray-500 shrink-0">分类：</span>
      <button
        class="px-3 py-1 rounded-full text-xs font-medium transition-colors"
        :class="!matchedTopic
          ? 'bg-primary-500 text-white'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'"
        @click="matchedTopic = ''"
      >
        全部
      </button>
      <button
        v-for="topic in topicOptions.slice(1)"
        :key="topic.value"
        class="px-3 py-1 rounded-full text-xs font-medium transition-colors"
        :class="matchedTopic === topic.value
          ? 'bg-primary-500 text-white'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'"
        @click="matchedTopic = matchedTopic === topic.value ? '' : topic.value"
      >
        {{ topic.label }}
      </button>
    </div>

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
              <span>{{ new Date(article.publishedAt).toLocaleDateString('zh-CN') }}</span>
              <UBadge v-if="article.vectorized" color="green" size="xs" variant="subtle">已向量化</UBadge>
              <UButton v-if="article.vectorized" @click="removeVector(article.id)" size="xs" color="red" variant="ghost" class="ml-1">移除向量</UButton>
              <template v-if="!article.vectorized">
                <template v-if="article.downloadStatus !== 'downloaded'">
                  <UBadge color="orange" size="xs" variant="subtle">未下载正文</UBadge>
                  <UButton
                    @click="downloadContent(article.id)"
                    :loading="downloadingId === article.id"
                    size="xs"
                    color="blue"
                    variant="ghost"
                    class="ml-1"
                  >
                    下载正文
                  </UButton>
                </template>
                <UButton v-else @click="vectorizeOne(article.id)" :loading="vectorizingId === article.id" size="xs" color="green" variant="ghost" class="ml-1">向量化</UButton>
              </template>
            </div>
            <div v-if="article.matchedTopic" class="flex items-center gap-2 mt-2 flex-wrap">
              <span class="text-sm font-medium text-primary-500 cursor-pointer hover:text-primary-600" @click="matchedTopic = article.matchedTopic">{{ article.matchedTopic }}</span>
              <span v-if="article.classifyMethod" class="text-[11px] text-gray-400">({{ methodLabel[article.classifyMethod] || article.classifyMethod }})</span>
              <UBadge v-if="article.manualClassify" color="purple" size="xs" variant="subtle">人工分类校准</UBadge>
              <UButton v-if="article.manualClassify" @click="clearManualClassify(article.id)" size="xs" color="gray" variant="ghost" class="text-[11px]">清除标注</UButton>
              <template v-if="article.matchedKeywordsJson && article.classifyMethod === 'keyword'">
                <span
                  v-for="(kw, idx) in JSON.parse(article.matchedKeywordsJson)"
                  :key="idx"
                  class="text-[11px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                >
                  {{ kw.source === 'title' ? '标题' : kw.source === 'content' ? '正文' : kw.source === 'digest' ? '摘要' : '组合' }}:「{{ kw.keyword }}」
                </span>
              </template>
              <span v-else-if="article.classifyMethod === 'llm'" class="text-[11px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                AI语义判断
              </span>
              <UButton v-if="!article.manualClassify" @click="openManualClassify(article.id, article.matchedTopic)" size="xs" color="purple" variant="ghost" class="text-[11px]">人工校准</UButton>
            </div>
            <div v-else class="flex items-center gap-2 mt-2">
              <UBadge v-if="article.manualClassify" color="purple" size="xs" variant="subtle">人工分类校准</UBadge>
              <UButton v-if="article.manualClassify" @click="clearManualClassify(article.id)" size="xs" color="gray" variant="ghost" class="text-[11px]">清除标注</UButton>
              <UButton v-else @click="openManualClassify(article.id)" size="xs" color="purple" variant="ghost" class="text-[11px]">人工分类</UButton>
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
          <p class="text-sm text-gray-500">每篇文章将生成约 400 字的摘要总结，按行业分类分组输出。</p>
          <div class="flex items-center gap-4 pt-2">
            <label class="text-sm text-gray-600 dark:text-gray-400">导出范围</label>
            <label class="flex items-center gap-1.5 text-sm">
              <input type="checkbox" v-model="exportIncludeDomestic" class="rounded border-gray-300" />
              国内资讯
            </label>
            <label class="flex items-center gap-1.5 text-sm">
              <input type="checkbox" v-model="exportIncludeOverseas" class="rounded border-gray-300" />
              外网资讯
            </label>
          </div>
          <div class="flex items-center gap-3 pt-2">
            <label class="text-sm text-gray-600 dark:text-gray-400">导出格式</label>
            <USelect v-model="exportFormat" :options="formatOptions" value-attribute="value" option-attribute="label" class="w-48" />
          </div>
        </div>
        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton @click="cancelExport" color="gray" variant="ghost">取消</UButton>
            <UButton @click="confirmExport" :loading="exportLoading" color="green" :disabled="!exportIncludeDomestic && !exportIncludeOverseas">
              确认导出
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
            <div class="bg-green-500 h-2.5 rounded-full transition-all duration-300" :style="{ width: exportTotal > 0 ? `${(exportProgress / exportTotal) * 100}%` : '0%' }" />
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

    <!-- 人工分类弹窗 -->
    <UModal :model-value="!!manualClassifyId" @close="manualClassifyId = null">
      <UCard>
        <template #header>
          <h3 class="font-semibold text-lg">人工标注分类</h3>
        </template>
        <div class="space-y-4">
          <p class="text-sm text-gray-500">
            选择目标行业分类。人工标注优先级最高，后续重新分类不会覆盖此设置。
          </p>
          <USelect
            v-model="manualClassifyTopic"
            :options="classifyTopicOptions"
            value-attribute="value"
            option-attribute="label"
            placeholder="选择行业分类..."
          />
        </div>
        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton color="gray" variant="ghost" @click="manualClassifyId = null">取消</UButton>
            <UButton
              color="purple"
              :loading="manualClassifyLoading"
              :disabled="!manualClassifyTopic"
              @click="submitManualClassify"
            >
              确认标注
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
