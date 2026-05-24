<script setup lang="ts">
import { subDays, subMonths, format } from 'date-fns';

// --- 筛选条件 ---
const sourceType = ref('');
const filterStatus = ref('');
const matchedTopic = ref('');
const rangePreset = ref('2weeks');

const { data: sourcesData } = await useFetch('/api/sources');
const { data: topicsData } = await useFetch('/api/topics');

/** 将 rangePreset 转为 API 的 dateRange 参数 */
function getDateRangeParam(): string | undefined {
  switch (rangePreset.value) {
    case '2weeks': return '2w';
    case '1month': return '1m';
    case '3months': return '3m';
    case 'custom': return undefined;
    default: return undefined;
  }
}

// 预览文章列表（根据筛选条件实时查询）
const { data: previewData } = await useFetch('/api/articles', {
  query: computed(() => ({
    pageSize: 100,
    sourceType: sourceType.value || undefined,
    filterStatus: filterStatus.value || undefined,
    matchedTopic: matchedTopic.value || undefined,
    dateRange: getDateRangeParam(),
  })),
  watch: [sourceType, filterStatus, matchedTopic, rangePreset],
});

const sourceTypeOptions = [
  { label: '全部渠道', value: '' },
  { label: '微信公众号', value: 'wechat' },
  { label: 'RSS', value: 'rss' },
  { label: '网页', value: 'web' },
  { label: '手动录入', value: 'manual' },
];

const filterStatusOptions = [
  { label: '全部状态', value: '' },
  { label: '待筛选', value: 'pending' },
  { label: '已通过', value: 'accepted' },
  { label: '已排除', value: 'rejected' },
];

const topicOptions = computed(() => {
  const list = topicsData.value?.topics || [];
  return [{ label: '全部分类', value: '' }, ...list.map(t => ({ label: `${t.name} (${t.articleCount})`, value: t.name }))];
});

// --- 导出功能 ---
const customStart = ref('');
const customEnd = ref('');
const exportFormat = ref('markdown');
const loading = ref(false);
const result = ref<{ content: string; articleCount: number; categories: string[]; message?: string } | null>(null);
const error = ref('');

const formatOptions = [
  { label: 'Markdown', value: 'markdown' },
  { label: 'Word 文档 (.docx)', value: 'docx' },
];

const presetOptions = [
  { label: '最近 2 周', value: '2weeks' },
  { label: '最近 1 个月', value: '1month' },
  { label: '最近 3 个月', value: '3months' },
  { label: '自定义', value: 'custom' },
];

function getDateRange() {
  const now = new Date();
  const endDate = format(now, 'yyyy-MM-dd');

  if (rangePreset.value === '2weeks') {
    return { startDate: format(subDays(now, 14), 'yyyy-MM-dd'), endDate };
  }
  if (rangePreset.value === '1month') {
    return { startDate: format(subMonths(now, 1), 'yyyy-MM-dd'), endDate };
  }
  if (rangePreset.value === '3months') {
    return { startDate: format(subMonths(now, 3), 'yyyy-MM-dd'), endDate };
  }
  return { startDate: customStart.value, endDate: customEnd.value };
}

/** 构建筛选参数 */
function getFilterParams() {
  const params: Record<string, any> = {};
  if (sourceType.value) params.sourceType = sourceType.value;
  if (filterStatus.value) params.filterStatus = filterStatus.value;
  if (matchedTopic.value) params.topic = matchedTopic.value;
  return params;
}

async function doExport() {
  const { startDate, endDate } = getDateRange();
  if (!startDate || !endDate) {
    error.value = '请选择日期范围';
    return;
  }

  loading.value = true;
  error.value = '';
  result.value = null;

  const filters = getFilterParams();

  try {
    if (exportFormat.value === 'docx') {
      const response = await $fetch('/api/articles/export-docx', {
        method: 'POST',
        body: { dateRange: getDateRangeParam(), ...filters },
        responseType: 'blob',
      });
      const blob = new Blob([response as any], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `信息资讯推送_${startDate}_${endDate}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      result.value = { content: '', articleCount: 0, categories: [], message: 'Word 文档已下载' };
    } else {
      const data = await $fetch('/api/articles/export-summary', {
        method: 'POST',
        body: { dateRange: getDateRangeParam(), ...filters },
      });
      result.value = { content: (data as any).content, articleCount: (data as any).articleCount, categories: [], message: undefined };
    }
  } catch (e: any) {
    error.value = e.data?.message || '导出失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}

function downloadMarkdown() {
  if (!result.value?.content) return;

  const blob = new Blob([result.value.content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const { startDate, endDate } = getDateRange();
  a.href = url;
  a.download = `行业资讯报告_${startDate}_${endDate}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- 推送功能（前端展示占位） ---
const pushTasks = ref([
  { id: 1, email: 'team@example.com', frequency: 'weekly', topic: '海洋油气装备', enabled: true, lastSent: '2026-05-19' },
  { id: 2, email: 'leader@example.com', frequency: 'biweekly', topic: '全部行业', enabled: false, lastSent: null },
]);

const showAddPush = ref(false);
const newPush = ref({
  email: '',
  frequency: 'weekly',
  topic: '',
});

const frequencyOptions = [
  { label: '每天', value: 'daily' },
  { label: '每周', value: 'weekly' },
  { label: '每两周', value: 'biweekly' },
  { label: '每月', value: 'monthly' },
];

const frequencyLabel: Record<string, string> = {
  daily: '每天',
  weekly: '每周',
  biweekly: '每两周',
  monthly: '每月',
};

function addPushTask() {
  if (!newPush.value.email) return;
  pushTasks.value.push({
    id: Date.now(),
    email: newPush.value.email,
    frequency: newPush.value.frequency,
    topic: newPush.value.topic || '全部行业',
    enabled: true,
    lastSent: null,
  });
  showAddPush.value = false;
  newPush.value = { email: '', frequency: 'weekly', topic: '' };
}

function removePushTask(id: number) {
  pushTasks.value = pushTasks.value.filter(t => t.id !== id);
}

function togglePushTask(id: number) {
  const task = pushTasks.value.find(t => t.id === id);
  if (task) task.enabled = !task.enabled;
}
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <!-- 页面标题带背景 -->
    <div
      class="relative rounded-xl overflow-hidden py-8 px-6"
      style="background-image: url('/bg/bg2.jpg'); background-size: cover; background-position: center;"
    >
      <div class="absolute inset-0 bg-gradient-to-r from-green-900/75 to-teal-800/60" />
      <div class="relative z-10">
        <h1 class="text-2xl font-bold text-white">导出与推送</h1>
        <p class="text-green-100 mt-1">
          导出资讯报告，或设置定时推送到指定邮箱
        </p>
      </div>
    </div>

    <!-- Tabs -->
    <UTabs :items="[{ label: '手动导出', slot: 'export' }, { label: '定时推送', slot: 'push' }]">
      <template #export>
        <div class="space-y-6 pt-4">
          <!-- 导出配置 -->
          <UCard>
            <div class="space-y-4">
              <!-- 筛选条件 -->
              <div class="flex flex-wrap items-center gap-3">
                <USelect v-model="rangePreset" :options="presetOptions" value-attribute="value" option-attribute="label" class="w-36" />
                <USelect v-model="sourceType" :options="sourceTypeOptions" value-attribute="value" option-attribute="label" class="w-36" />
                <USelect v-model="filterStatus" :options="filterStatusOptions" value-attribute="value" option-attribute="label" class="w-32" />
                <USelect v-model="matchedTopic" :options="topicOptions" value-attribute="value" option-attribute="label" class="w-44" />
              </div>

              <!-- 自定义日期 -->
              <div v-if="rangePreset === 'custom'" class="flex items-center gap-4">
                <label class="text-sm font-medium text-gray-700 dark:text-gray-300 w-20">起止日期</label>
                <input
                  v-model="customStart"
                  type="date"
                  class="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm"
                />
                <span class="text-gray-500">至</span>
                <input
                  v-model="customEnd"
                  type="date"
                  class="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm"
                />
              </div>

              <!-- 导出格式 + 按钮 -->
              <div class="flex items-center gap-4">
                <label class="text-sm font-medium text-gray-700 dark:text-gray-300 w-20">导出格式</label>
                <USelect
                  v-model="exportFormat"
                  :options="formatOptions"
                  value-attribute="value"
                  option-attribute="label"
                  class="w-48"
                />
                <UButton @click="doExport" :loading="loading" :disabled="loading" color="primary">
                  导出资讯报告
                </UButton>
              </div>
            </div>
          </UCard>

          <!-- 错误提示 -->
          <UAlert v-if="error" color="red" :title="error" />

          <!-- 待导出文章预览 -->
          <UCard v-if="previewData?.articles?.length">
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">待导出文章</h3>
                <span class="text-sm text-gray-500">共 {{ previewData.total }} 篇</span>
              </div>
            </template>
            <div class="max-h-80 overflow-y-auto">
              <table class="w-full text-sm">
                <thead class="text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th class="text-left py-2 pr-3">标题</th>
                    <th class="text-left py-2 px-3 w-28">分类</th>
                    <th class="text-left py-2 pl-3 w-24">发布时间</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                  <tr v-for="article in previewData.articles" :key="article.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td class="py-2 pr-3">
                      <a :href="article.link" target="_blank" class="text-gray-900 dark:text-white hover:text-primary-600 line-clamp-1">
                        {{ article.title }}
                      </a>
                    </td>
                    <td class="py-2 px-3">
                      <UBadge v-if="article.matchedTopic" color="blue" size="xs" variant="subtle">{{ article.matchedTopic }}</UBadge>
                      <span v-else class="text-gray-400">-</span>
                    </td>
                    <td class="py-2 pl-3 text-gray-500 whitespace-nowrap">
                      {{ new Date(article.publishedAt).toLocaleDateString('zh-CN') }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="previewData.total > 100" class="pt-3 text-xs text-gray-400 border-t border-gray-200 dark:border-gray-700 mt-3">
              仅显示前 100 篇，导出时最多处理 200 篇
            </div>
          </UCard>

          <UAlert v-else-if="previewData && !previewData.articles?.length" color="yellow" title="当前筛选条件下无文章" />

          <!-- 空结果提示 -->
          <UAlert v-if="result && !result.content && result.message" color="yellow" :title="result.message" />

          <!-- Word 下载成功提示 -->
          <UAlert v-if="result && !result.content && result.message === 'Word 文档已下载'" color="green" :title="result.message" />

          <!-- 导出结果 -->
          <UCard v-if="result?.content">
            <template #header>
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="font-semibold">导出结果</h3>
                  <p class="text-sm text-gray-500 mt-1">
                    共 {{ result.articleCount }} 篇文章，覆盖 {{ result.categories.length }} 个行业类别
                  </p>
                </div>
                <UButton @click="downloadMarkdown" color="green" size="sm">
                  下载 .md 文件
                </UButton>
              </div>
            </template>
            <div class="prose dark:prose-invert max-w-none max-h-96 overflow-y-auto">
              <pre class="text-sm whitespace-pre-wrap">{{ result.content }}</pre>
            </div>
          </UCard>
        </div>
      </template>

      <template #push>
        <div class="space-y-6 pt-4">
          <!-- 说明 -->
          <UAlert color="blue" title="功能预览" description="定时推送功能正在开发中，后续将支持邮件、企业微信、钉钉等多渠道推送。当前仅展示配置界面。" />

          <!-- 操作栏 -->
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">推送任务</h3>
            <UButton @click="showAddPush = !showAddPush" color="primary" size="sm">
              {{ showAddPush ? '取消' : '新增推送' }}
            </UButton>
          </div>

          <!-- 新增推送表单 -->
          <UCard v-if="showAddPush">
            <template #header>
              <h3 class="font-semibold">新增推送任务</h3>
            </template>
            <div class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <UFormGroup label="接收邮箱">
                  <UInput v-model="newPush.email" type="email" placeholder="name@company.com" />
                </UFormGroup>
                <UFormGroup label="推送频率">
                  <USelect v-model="newPush.frequency" :options="frequencyOptions" value-attribute="value" option-attribute="label" />
                </UFormGroup>
                <UFormGroup label="行业范围">
                  <UInput v-model="newPush.topic" placeholder="留空则推送全部行业" />
                </UFormGroup>
              </div>
              <div class="flex items-center gap-3">
                <UButton @click="addPushTask" color="primary" size="sm" :disabled="!newPush.email">保存</UButton>
                <span class="text-xs text-gray-400">推送渠道：邮件（更多渠道即将支持）</span>
              </div>
            </div>
          </UCard>

          <!-- 推送任务列表 -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">已配置的推送任务</h3>
            </template>
            <div v-if="pushTasks.length" class="divide-y divide-gray-200 dark:divide-gray-700">
              <div v-for="task in pushTasks" :key="task.id" class="flex items-center justify-between py-3">
                <div class="flex items-center gap-4">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium text-gray-900 dark:text-white">{{ task.email }}</span>
                      <UBadge :color="task.enabled ? 'green' : 'gray'" size="xs">
                        {{ task.enabled ? '启用' : '暂停' }}
                      </UBadge>
                    </div>
                    <div class="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>频率：{{ frequencyLabel[task.frequency] || task.frequency }}</span>
                      <span>范围：{{ task.topic }}</span>
                      <span v-if="task.lastSent">上次推送：{{ task.lastSent }}</span>
                      <span v-else class="text-orange-500">尚未推送</span>
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <UButton @click="togglePushTask(task.id)" size="xs" color="gray" variant="ghost">
                    {{ task.enabled ? '暂停' : '启用' }}
                  </UButton>
                  <UButton @click="removePushTask(task.id)" size="xs" color="red" variant="ghost">删除</UButton>
                </div>
              </div>
            </div>
            <div v-else class="text-sm text-gray-500 py-4 text-center">暂无推送任务</div>
          </UCard>

          <!-- 渠道预告 -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">推送渠道</h3>
            </template>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div class="text-center p-4 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
                <div class="text-2xl mb-1">📧</div>
                <div class="text-sm font-medium text-green-700 dark:text-green-400">邮件</div>
                <UBadge color="green" size="xs" class="mt-1">可用</UBadge>
              </div>
              <div class="text-center p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div class="text-2xl mb-1">💬</div>
                <div class="text-sm font-medium text-gray-500">企业微信</div>
                <UBadge color="gray" size="xs" class="mt-1">即将支持</UBadge>
              </div>
              <div class="text-center p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div class="text-2xl mb-1">🔔</div>
                <div class="text-sm font-medium text-gray-500">钉钉</div>
                <UBadge color="gray" size="xs" class="mt-1">即将支持</UBadge>
              </div>
              <div class="text-center p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div class="text-2xl mb-1">🌐</div>
                <div class="text-sm font-medium text-gray-500">Webhook</div>
                <UBadge color="gray" size="xs" class="mt-1">规划中</UBadge>
              </div>
            </div>
          </UCard>
        </div>
      </template>
    </UTabs>
  </div>
</template>
