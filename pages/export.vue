<script setup lang="ts">
const { data: topicsData } = await useFetch('/api/topics');
const { data: pushData, refresh: refreshPushTasks } = await useFetch('/api/push');

const pushTasks = computed(() => pushData.value?.tasks || []);
const error = ref('');

const topicOptions = computed(() => {
  const list = topicsData.value?.topics || [];
  return list.map(t => ({ label: t.name, value: t.name }));
});

// --- SMTP 测试 ---
const testEmail = ref('');
const testLoading = ref(false);
const testResult = ref<{ success: boolean; message: string } | null>(null);

async function testSmtp() {
  if (!testEmail.value) return;
  testLoading.value = true;
  testResult.value = null;
  try {
    const res = await $fetch('/api/push/test-smtp', {
      method: 'POST',
      body: { email: testEmail.value },
    });
    testResult.value = { success: true, message: (res as any).message };
  } catch (e: any) {
    testResult.value = { success: false, message: e.data?.message || '发送失败' };
  } finally {
    testLoading.value = false;
  }
}

// --- 新增任务 ---
const showAddPush = ref(false);
const newPush = ref({
  email: '',
  frequency: 'weekly',
  dateRange: '2w',
  topics: [] as string[],
});

// 实时预览可推送文章数
const previewQuery = computed(() => ({
  dateRange: newPush.value.dateRange,
  topics: newPush.value.topics.join(','),
}));
const { data: previewCount } = await useFetch('/api/push/preview-count', {
  query: previewQuery,
  watch: [() => newPush.value.dateRange, () => newPush.value.topics],
});
const articleCount = computed(() => previewCount.value?.count ?? 0);

const frequencyOptions = [
  { label: '每天', value: 'daily' },
  { label: '每周', value: 'weekly' },
  { label: '每两周', value: 'biweekly' },
  { label: '每月', value: 'monthly' },
];

const dateRangeOptions = [
  { label: '最近 3 天', value: '3d' },
  { label: '最近 7 天', value: '1w' },
  { label: '最近 2 周', value: '2w' },
  { label: '最近 1 个月', value: '1m' },
];

const frequencyLabel: Record<string, string> = {
  daily: '每天',
  weekly: '每周',
  biweekly: '每两周',
  monthly: '每月',
};

const dateRangeLabel: Record<string, string> = {
  '3d': '最近3天',
  '1w': '最近7天',
  '2w': '最近2周',
  '1m': '最近1个月',
};

async function addPushTask() {
  if (!newPush.value.email) return;
  error.value = '';
  try {
    await $fetch('/api/push', {
      method: 'POST',
      body: {
        email: newPush.value.email,
        frequency: newPush.value.frequency,
        dateRange: newPush.value.dateRange,
        topics: newPush.value.topics,
      },
    });
    showAddPush.value = false;
    newPush.value = { email: '', frequency: 'weekly', dateRange: '2w', topics: [] };
    await refreshPushTasks();
  } catch (e: any) {
    error.value = e.data?.message || '添加失败';
  }
}

// --- 任务操作 ---
const sendingTaskId = ref<number | null>(null);

async function removePushTask(id: number) {
  try {
    await $fetch(`/api/push/${id}`, { method: 'DELETE' });
    await refreshPushTasks();
  } catch (e: any) {
    error.value = e.data?.message || '删除失败';
  }
}

async function togglePushTask(id: number, currentEnabled: boolean) {
  try {
    await $fetch(`/api/push/${id}`, {
      method: 'PATCH',
      body: { enabled: !currentEnabled },
    });
    await refreshPushTasks();
  } catch (e: any) {
    error.value = e.data?.message || '操作失败';
  }
}

async function sendPushNow(taskId: number) {
  // 先获取可推送文章数量
  const task = pushTasks.value.find((t: any) => t.id === taskId);
  if (!task) return;

  try {
    const countRes = await $fetch('/api/push/preview-count', {
      params: {
        dateRange: task.dateRange || '2w',
        topics: (task.topics || []).join(','),
      },
    });
    const count = (countRes as any).count;
    if (!confirm(`当前筛选条件下共有 ${count} 篇文章可推送。\n每篇文章将生成约 400 字的摘要总结，确定发送？`)) return;
  } catch {}

  sendingTaskId.value = taskId;
  testResult.value = null;
  try {
    const res = await $fetch('/api/push/send', {
      method: 'POST',
      body: { taskId },
    });
    testResult.value = { success: true, message: (res as any).message };
    await refreshPushTasks();
  } catch (e: any) {
    testResult.value = { success: false, message: e.data?.message || '推送失败' };
  } finally {
    sendingTaskId.value = null;
  }
}
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <!-- 页面标题 -->
    <div
      class="relative rounded-xl overflow-hidden py-8 px-6"
      style="background-image: url('/bg/bg2.jpg'); background-size: cover; background-position: center;"
    >
      <div class="absolute inset-0 bg-gradient-to-r from-green-900/75 to-teal-800/60" />
      <div class="relative z-10">
        <h1 class="text-2xl font-bold text-white">定期推送</h1>
        <p class="text-green-100 mt-1">设置定时推送行业资讯摘要到指定邮箱</p>
      </div>
    </div>

    <!-- 全局提示 -->
    <UAlert v-if="testResult" :color="testResult.success ? 'green' : 'red'" :title="testResult.message" />
    <UAlert v-if="error" color="red" :title="error" />

    <!-- SMTP 连通测试 -->
    <UCard>
      <template #header>
        <h3 class="font-semibold">📧 邮箱连通测试</h3>
      </template>
      <div class="flex items-center gap-3">
        <UInput v-model="testEmail" type="email" placeholder="输入邮箱地址测试发信" class="flex-1" />
        <UButton @click="testSmtp" :loading="testLoading" :disabled="!testEmail || testLoading" color="green" size="sm">
          发送测试
        </UButton>
      </div>
    </UCard>

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
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UFormGroup label="接收邮箱">
            <UInput v-model="newPush.email" type="email" placeholder="name@company.com" />
          </UFormGroup>
          <UFormGroup label="推送频率">
            <USelect v-model="newPush.frequency" :options="frequencyOptions" value-attribute="value" option-attribute="label" />
          </UFormGroup>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UFormGroup label="导出时间范围" help="每次推送时，导出该时间段内的文章">
            <USelect v-model="newPush.dateRange" :options="dateRangeOptions" value-attribute="value" option-attribute="label" />
          </UFormGroup>
          <UFormGroup label="行业范围" help="可多选，留空推送全部行业">
            <USelectMenu
              v-model="newPush.topics"
              :options="topicOptions"
              value-attribute="value"
              option-attribute="label"
              multiple
              placeholder="选择行业（可多选）"
            />
          </UFormGroup>
        </div>
        <!-- 文章数量预览 -->
        <div class="rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-4">
          <p class="text-sm text-gray-700 dark:text-gray-300">
            当前筛选条件下共有
            <span class="text-lg font-bold text-primary-600 dark:text-primary-400 mx-1">{{ articleCount }}</span>
            篇文章可推送。
          </p>
          <p class="text-xs text-gray-500 mt-1">每篇文章将生成约 400 字的摘要总结，按行业分类分组输出。</p>
        </div>

        <div class="flex items-center gap-3 pt-2">
          <UButton @click="addPushTask" color="primary" size="sm" :disabled="!newPush.email">保存任务</UButton>
          <span class="text-xs text-gray-400">保存后可点击「立即推送」测试效果</span>
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
          <div>
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-gray-900 dark:text-white">{{ task.email }}</span>
              <UBadge :color="task.enabled ? 'green' : 'gray'" size="xs">
                {{ task.enabled ? '启用' : '暂停' }}
              </UBadge>
              <UBadge v-if="task.lastStatus === 'success'" color="green" size="xs" variant="subtle">发送成功</UBadge>
              <UBadge v-else-if="task.lastStatus === 'failed'" color="red" size="xs" variant="subtle">发送失败</UBadge>
            </div>
            <div class="flex items-center gap-3 mt-1 text-xs text-gray-500">
              <span>频率：{{ frequencyLabel[task.frequency] || task.frequency }}</span>
              <span>范围：{{ dateRangeLabel[task.dateRange] || task.dateRange || '最近2周' }}</span>
              <span>行业：{{ task.topics?.length ? task.topics.join('、') : '全部' }}</span>
            </div>
            <div class="flex items-center gap-3 mt-1 text-xs text-gray-500">
              <span v-if="task.lastSentAt">上次推送：{{ new Date(task.lastSentAt).toLocaleString('zh-CN') }}</span>
              <span v-else class="text-orange-500">尚未推送</span>
            </div>
            <div v-if="task.lastError" class="text-xs text-red-500 mt-1">错误：{{ task.lastError }}</div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <UButton
              @click="sendPushNow(task.id)"
              size="xs"
              color="green"
              variant="soft"
              :loading="sendingTaskId === task.id"
              :disabled="sendingTaskId === task.id"
            >
              立即推送
            </UButton>
            <UButton @click="togglePushTask(task.id, task.enabled)" size="xs" color="gray" variant="ghost">
              {{ task.enabled ? '暂停' : '启用' }}
            </UButton>
            <UButton @click="removePushTask(task.id)" size="xs" color="red" variant="ghost">删除</UButton>
          </div>
        </div>
      </div>
      <div v-else class="text-sm text-gray-500 py-6 text-center">暂无推送任务，点击「新增推送」添加</div>
    </UCard>
  </div>
</template>
