<script setup lang="ts">
interface ScraperSource {
  id: number;
  name: string;
  url: string;
  tableSelector: string;
  steps: any[];
  schedule: string | null;
  authConfig: any;
  enabled: boolean;
  lastScrapedAt: string | null;
  lastStatus: string;
  lastError: string | null;
  createdAt: string;
}

interface StepItem {
  action: string;
  selector?: string;
  value?: string;
  timeout?: number;
  description?: string;
}

const { data: sources, refresh } = await useFetch<ScraperSource[]>('/api/scraper/sources');

const showFormModal = ref(false);
const showDataModal = ref(false);
const selectedSource = ref<ScraperSource | null>(null);
const executing = ref<number | null>(null);
const detecting = ref(false);
const detectedTables = ref<{ selector: string; preview: string; rows: number }[]>([]);

// 编辑模式
const editingId = ref<number | null>(null);
const isEditing = computed(() => editingId.value !== null);

// ===== 表单 =====
const form = reactive({
  name: '',
  url: '',
  tableSelector: 'table',
  scheduleType: 'manual' as 'manual' | 'daily' | 'weekly' | 'monthly',
  scheduleHour: '8',
  scheduleWeekday: '1',
  scheduleDay: '1',
  steps: [] as StepItem[],
  enabled: true,
});

const actionOptions = [
  { label: '点击元素', value: 'click', needSelector: true, needValue: false },
  { label: '等待元素出现', value: 'waitForSelector', needSelector: true, needValue: false },
  { label: '等待加载', value: 'wait', needSelector: false, needValue: false },
  { label: '输入文字', value: 'type', needSelector: true, needValue: true },
  { label: '选择下拉项', value: 'select', needSelector: true, needValue: true },
  { label: '跳转页面', value: 'goto', needSelector: false, needValue: true },
];

const scheduleTypeOptions = [
  { label: '仅手动触发', value: 'manual' },
  { label: '每天', value: 'daily' },
  { label: '每周', value: 'weekly' },
  { label: '每月', value: 'monthly' },
];

const weekdayOptions = [
  { label: '周一', value: '1' },
  { label: '周二', value: '2' },
  { label: '周三', value: '3' },
  { label: '周四', value: '4' },
  { label: '周五', value: '5' },
  { label: '周六', value: '6' },
  { label: '周日', value: '0' },
];

const hourOptions = Array.from({ length: 24 }, (_, i) => ({
  label: `${i}:00`,
  value: String(i),
}));

function buildCron(): string | null {
  switch (form.scheduleType) {
    case 'daily': return `0 ${form.scheduleHour} * * *`;
    case 'weekly': return `0 ${form.scheduleHour} * * ${form.scheduleWeekday}`;
    case 'monthly': return `0 ${form.scheduleHour} ${form.scheduleDay} * *`;
    default: return null;
  }
}

function parseCron(cron: string | null) {
  if (!cron) { form.scheduleType = 'manual'; return; }
  const parts = cron.split(' ');
  if (parts.length !== 5) { form.scheduleType = 'manual'; return; }
  const [, hour, day, , weekday] = parts;
  form.scheduleHour = hour;
  if (weekday !== '*') {
    form.scheduleType = 'weekly';
    form.scheduleWeekday = weekday;
  } else if (day !== '*') {
    form.scheduleType = 'monthly';
    form.scheduleDay = day;
  } else {
    form.scheduleType = 'daily';
  }
}

function cronToText(cron: string | null): string {
  if (!cron) return '手动触发';
  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;
  const [, hour, day, , weekday] = parts;
  if (day !== '*' && weekday === '*') return `每月${day}号 ${hour}:00`;
  if (weekday !== '*') {
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `每${dayNames[Number(weekday)] || weekday} ${hour}:00`;
  }
  return `每天 ${hour}:00`;
}

function resetForm() {
  form.name = '';
  form.url = '';
  form.tableSelector = 'table';
  form.scheduleType = 'manual';
  form.scheduleHour = '8';
  form.scheduleWeekday = '1';
  form.scheduleDay = '1';
  form.steps = [];
  form.enabled = true;
  editingId.value = null;
  detectedTables.value = [];
  aiInstruction.value = '';
  aiError.value = '';
}

// 打开新增弹窗
function openAdd() {
  resetForm();
  showFormModal.value = true;
}

// 打开编辑弹窗
function openEdit(source: ScraperSource) {
  editingId.value = source.id;
  form.name = source.name;
  form.url = source.url;
  form.tableSelector = source.tableSelector;
  form.enabled = source.enabled;
  form.steps = (source.steps || []).map((s: any) => ({
    action: s.action || 'click',
    selector: s.selector || '',
    value: s.value || '',
    timeout: s.timeout || 5000,
    description: s.description || '',
  }));
  parseCron(source.schedule);
  detectedTables.value = [];
  aiInstruction.value = '';
  aiError.value = '';
  showFormModal.value = true;
}

function addStep() {
  form.steps.push({ action: 'click', selector: '', value: '', timeout: 5000 });
}

function removeStep(index: number) {
  form.steps.splice(index, 1);
}

// ===== AI 智能配置 =====
const aiInstruction = ref('');
const aiGenerating = ref(false);
const aiError = ref('');

async function generateStepsWithAI() {
  if (!form.url || !aiInstruction.value) return;
  aiGenerating.value = true;
  aiError.value = '';
  try {
    const result = await $fetch('/api/scraper/ai-steps', {
      method: 'POST',
      body: { url: form.url, instruction: aiInstruction.value },
    });
    form.steps = (result.steps || []).map((s: any) => ({
      action: s.action || 'click',
      selector: s.selector || '',
      value: s.value || '',
      timeout: s.timeout || 5000,
      description: s.description || '',
    }));
  } catch (err: any) {
    aiError.value = err.message || 'AI 生成失败，请重试';
  } finally {
    aiGenerating.value = false;
  }
}

async function detectTables() {
  if (!form.url) return;
  detecting.value = true;
  detectedTables.value = [];
  try {
    const result = await $fetch('/api/scraper/detect', {
      method: 'POST',
      body: { url: form.url },
    });
    detectedTables.value = result.tables || [];
    if (detectedTables.value.length === 1) {
      form.tableSelector = detectedTables.value[0].selector;
    }
  } catch (err: any) {
    alert(`检测失败: ${err.message || '无法访问该页面'}`);
  } finally {
    detecting.value = false;
  }
}

function selectTable(selector: string) {
  form.tableSelector = selector;
}

// 保存（新增或更新）
async function saveSource() {
  const body = {
    name: form.name,
    url: form.url,
    tableSelector: form.tableSelector,
    schedule: buildCron(),
    steps: form.steps.filter(s => s.action),
    enabled: form.enabled,
  };

  if (isEditing.value) {
    await $fetch(`/api/scraper/${editingId.value}`, { method: 'PUT', body });
  } else {
    await $fetch('/api/scraper/sources', { method: 'POST', body });
  }
  showFormModal.value = false;
  resetForm();
  refresh();
}

async function toggleEnabled(source: ScraperSource) {
  await $fetch(`/api/scraper/${source.id}`, {
    method: 'PUT',
    body: { enabled: !source.enabled },
  });
  refresh();
}

async function deleteSource(source: ScraperSource) {
  if (!confirm(`确定删除数据源「${source.name}」？`)) return;
  await $fetch(`/api/scraper/${source.id}`, { method: 'DELETE' });
  refresh();
}

async function executeScrape(source: ScraperSource) {
  executing.value = source.id;
  try {
    const result = await $fetch('/api/scraper/execute', {
      method: 'POST',
      body: { sourceId: source.id },
    });
    if (result.success) {
      alert(`抓取成功！获取 ${result.rowCount} 行数据`);
    } else {
      alert(`抓取失败: ${result.error}`);
    }
    refresh();
  } catch (err: any) {
    alert(`执行出错: ${err.message}`);
  } finally {
    executing.value = null;
  }
}

function viewData(source: ScraperSource) {
  selectedSource.value = source;
  showDataModal.value = true;
}

function formatTime(t: string | null) {
  if (!t) return '-';
  return new Date(t).toLocaleString('zh-CN');
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">数据抓取</h1>
        <p class="text-sm text-gray-500 mt-1">从第三方网站定期抓取表格数据，用于图表可视化</p>
      </div>
      <UButton icon="i-heroicons-plus" @click="openAdd">添加数据源</UButton>
    </div>

    <!-- 数据源列表 -->
    <div class="grid gap-4">
      <div
        v-for="source in sources"
        :key="source.id"
        class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="text-base font-semibold text-gray-900 dark:text-white truncate">
                {{ source.name }}
              </h3>
              <UBadge :color="source.enabled ? 'green' : 'gray'" size="xs">
                {{ source.enabled ? '启用' : '禁用' }}
              </UBadge>
              <UBadge
                v-if="source.lastStatus !== 'pending'"
                :color="source.lastStatus === 'success' ? 'blue' : 'red'"
                size="xs"
              >
                {{ source.lastStatus === 'success' ? '抓取成功' : '抓取失败' }}
              </UBadge>
            </div>
            <p class="text-sm text-gray-500 mt-1 truncate">{{ source.url }}</p>
            <div class="flex items-center gap-4 mt-2 text-xs text-gray-400">
              <span>{{ cronToText(source.schedule) }}</span>
              <span>上次抓取: {{ formatTime(source.lastScrapedAt) }}</span>
            </div>
            <p
              v-if="source.lastError"
              class="text-xs text-red-500 mt-1 line-clamp-1 cursor-pointer hover:line-clamp-none"
              :title="source.lastError"
            >
              {{ source.lastError }}
            </p>
          </div>

          <!-- 操作按钮 - 固定不被挤压 -->
          <div class="flex items-center gap-1 shrink-0">
            <UButton
              size="sm" color="primary" variant="soft" icon="i-heroicons-play"
              :loading="executing === source.id"
              @click="executeScrape(source)"
            >
              抓取
            </UButton>
            <UButton
              size="sm" color="gray" variant="ghost" icon="i-heroicons-pencil-square"
              @click="openEdit(source)"
            />
            <UButton
              size="sm" color="gray" variant="ghost" icon="i-heroicons-table-cells"
              @click="viewData(source)"
            />
            <UButton
              size="sm" color="red" variant="ghost" icon="i-heroicons-trash"
              @click="deleteSource(source)"
            />
          </div>
        </div>
      </div>

      <div v-if="!sources?.length" class="text-center py-12 text-gray-400">
        <UIcon name="i-heroicons-globe-alt" class="text-4xl mb-3" />
        <p>暂无数据源，点击上方按钮添加</p>
      </div>
    </div>

    <!-- ===== 新增/编辑弹窗 ===== -->
    <UModal v-model="showFormModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">{{ isEditing ? '编辑数据源' : '添加数据源' }}</h3>
        </template>

        <div class="space-y-5 max-h-[70vh] overflow-y-auto">
          <UFormGroup label="数据源名称">
            <UInput v-model="form.name" placeholder="给这个数据源起个名字" />
          </UFormGroup>

          <UFormGroup label="网页地址">
            <UInput v-model="form.url" placeholder="粘贴目标网页的完整地址" />
          </UFormGroup>

          <!-- 表格检测 -->
          <UFormGroup label="选择要抓取的表格">
            <div class="space-y-3">
              <div class="flex gap-2">
                <UButton
                  color="primary" variant="soft" size="sm" icon="i-heroicons-magnifying-glass"
                  :loading="detecting" :disabled="!form.url"
                  @click="detectTables"
                >
                  自动检测页面表格
                </UButton>
                <span class="text-xs text-gray-400 self-center">点击后系统会访问网页并找出所有表格</span>
              </div>

              <div v-if="detectedTables.length" class="space-y-2">
                <p class="text-sm text-green-600 dark:text-green-400">
                  找到 {{ detectedTables.length }} 个表格，请选择：
                </p>
                <div
                  v-for="(t, idx) in detectedTables" :key="idx"
                  class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                  :class="form.tableSelector === t.selector
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'"
                  @click="selectTable(t.selector)"
                >
                  <UIcon
                    :name="form.tableSelector === t.selector ? 'i-heroicons-check-circle-solid' : 'i-heroicons-table-cells'"
                    :class="form.tableSelector === t.selector ? 'text-primary-500' : 'text-gray-400'"
                  />
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium">表格 {{ idx + 1 }}（{{ t.rows }} 行数据）</p>
                    <p class="text-xs text-gray-400 truncate">{{ t.preview }}</p>
                  </div>
                </div>
              </div>

              <details class="text-xs">
                <summary class="text-gray-400 cursor-pointer hover:text-gray-600">高级：手动输入选择器</summary>
                <UInput v-model="form.tableSelector" class="mt-2" size="sm" placeholder="CSS 选择器" />
              </details>
            </div>
          </UFormGroup>

          <!-- 定时规则 -->
          <UFormGroup label="抓取频率">
            <div class="space-y-3">
              <USelectMenu
                v-model="form.scheduleType"
                :options="scheduleTypeOptions"
                value-attribute="value"
                option-attribute="label"
              />
              <div v-if="form.scheduleType !== 'manual'" class="flex items-center gap-3">
                <template v-if="form.scheduleType === 'weekly'">
                  <span class="text-sm text-gray-500">每</span>
                  <USelectMenu v-model="form.scheduleWeekday" :options="weekdayOptions" value-attribute="value" option-attribute="label" class="w-24" />
                </template>
                <template v-if="form.scheduleType === 'monthly'">
                  <span class="text-sm text-gray-500">每月</span>
                  <UInput v-model="form.scheduleDay" type="number" :min="1" :max="28" class="w-16" />
                  <span class="text-sm text-gray-500">号</span>
                </template>
                <span v-if="form.scheduleType === 'daily'" class="text-sm text-gray-500">每天</span>
                <USelectMenu v-model="form.scheduleHour" :options="hourOptions" value-attribute="value" option-attribute="label" class="w-24" />
                <span class="text-sm text-gray-500">执行</span>
              </div>
            </div>
          </UFormGroup>

          <!-- 操作步骤 -->
          <UFormGroup label="页面操作步骤" hint="可选">
            <div class="space-y-3">
              <!-- AI 智能生成 -->
              <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p class="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
                  <UIcon name="i-heroicons-sparkles" class="mr-1" />AI 智能配置
                </p>
                <p class="text-xs text-blue-600 dark:text-blue-400 mb-2">
                  用自然语言描述你想获取什么数据，AI 会自动生成操作步骤
                </p>
                <div class="flex gap-2">
                  <UInput
                    v-model="aiInstruction" class="flex-1" size="sm"
                    placeholder="例如：选择左侧「能源」分类，时间选择最近5年"
                    :disabled="!form.url"
                    @keydown.enter.prevent="generateStepsWithAI"
                  />
                  <UButton
                    size="sm" color="primary" icon="i-heroicons-sparkles"
                    :loading="aiGenerating" :disabled="!form.url || !aiInstruction"
                    @click="generateStepsWithAI"
                  >
                    生成
                  </UButton>
                </div>
                <p v-if="aiError" class="text-xs text-red-500 mt-2">{{ aiError }}</p>
              </div>

              <!-- 步骤列表 -->
              <div
                v-for="(step, idx) in form.steps" :key="idx"
                class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-2"
              >
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-gray-500 w-5">{{ idx + 1 }}</span>
                  <USelectMenu
                    v-model="step.action"
                    :options="actionOptions"
                    value-attribute="value"
                    option-attribute="label"
                    class="w-36"
                    size="sm"
                  />
                  <span v-if="step.description" class="text-xs text-gray-400 flex-1 truncate">
                    {{ step.description }}
                  </span>
                  <UButton size="xs" color="red" variant="ghost" icon="i-heroicons-x-mark" @click="removeStep(idx)" />
                </div>
                <div class="flex items-center gap-2 pl-7">
                  <UInput
                    v-if="actionOptions.find(a => a.value === step.action)?.needSelector"
                    v-model="step.selector"
                    size="sm"
                    placeholder="CSS 选择器（如 .btn-submit、#tab-energy）"
                    class="flex-1"
                  />
                  <UInput
                    v-if="actionOptions.find(a => a.value === step.action)?.needValue"
                    v-model="step.value"
                    size="sm"
                    :placeholder="step.action === 'goto' ? '网址' : '输入内容'"
                    class="flex-1"
                  />
                  <UInput
                    v-if="step.action === 'wait'"
                    v-model.number="step.timeout"
                    size="sm"
                    type="number"
                    placeholder="等待毫秒"
                    class="w-28"
                  />
                </div>
              </div>

              <UButton size="sm" color="gray" variant="dashed" icon="i-heroicons-plus" block @click="addStep">
                手动添加步骤
              </UButton>

              <p class="text-xs text-gray-400">
                提示：如果目标表格直接可见，无需添加步骤。AI 生成的步骤可以手动修改选择器和参数。
              </p>
            </div>
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="showFormModal = false">取消</UButton>
            <UButton :disabled="!form.name || !form.url" @click="saveSource">
              {{ isEditing ? '保存修改' : '创建' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- 数据查看弹窗 -->
    <UModal v-model="showDataModal" :ui="{ width: 'max-w-4xl' }">
      <ScraperDataViewer
        v-if="selectedSource"
        :source="selectedSource"
        @close="showDataModal = false"
      />
    </UModal>
  </div>
</template>
