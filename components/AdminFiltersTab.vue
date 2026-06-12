<script setup lang="ts">
const emit = defineEmits<{
  changed: [];
}>();

const { data, refresh } = await useFetch('/api/filters');

const applyLoading = ref(false);
const applyResult = ref('');
const importLoading = ref(false);
const importResult = ref('');

/** 后台异步向量化（使用全局 composable） */
const { status: vectorizeStatus, start: startVectorize, cancel: cancelVectorize } = useVectorizeTask();

function autoVectorizeInBackground() {
  const sourceId = targetSourceId.value ? Number(targetSourceId.value) : undefined;
  startVectorize(sourceId);
}

const showAddForm = ref(false);
const newRule = ref({
  type: 'include' as 'include' | 'exclude',
  topic: '',
  description: '',
  titleKeywords: '',
  contentKeywords: '',
});

// 编辑状态
const editingId = ref<number | null>(null);
const editForm = ref({
  topic: '',
  description: '',
  titleKeywords: '',
  contentKeywords: '',
  priority: 99,
  requireAll: false,
  groups: '' as string, // 每组一行，组内关键词用逗号分隔
});

function startEdit(rule: any) {
  editingId.value = rule.id;
  editForm.value = {
    topic: rule.topic || '',
    description: rule.description || '',
    titleKeywords: (rule.titleKeywords as string[]).join('\n'),
    contentKeywords: (rule.contentKeywords as string[]).join('\n'),
    priority: rule.priority ?? 99,
    requireAll: rule.requireAll ?? false,
    groups: (rule.groups as string[][] || []).map((g: string[]) => g.join('、')).join('\n'),
  };
}

function cancelEdit() {
  editingId.value = null;
}

function parseGroups(text: string): string[][] {
  if (!text.trim()) return [];
  return text.split('\n').map(line => line.split(/[、,，]/).map(s => s.trim()).filter(Boolean)).filter(g => g.length > 0);
}

async function saveEdit(id: number) {
  try {
    await $fetch(`/api/filters/${id}`, {
      method: 'PUT',
      body: {
        topic: editForm.value.topic || undefined,
        description: editForm.value.description || undefined,
        titleKeywords: editForm.value.titleKeywords.split('\n').map(s => s.trim()).filter(Boolean),
        contentKeywords: editForm.value.contentKeywords.split('\n').map(s => s.trim()).filter(Boolean),
        priority: editForm.value.priority,
        requireAll: editForm.value.requireAll,
        groups: parseGroups(editForm.value.groups),
      },
    });
    editingId.value = null;
    refresh();
    emit('changed');
  } catch (e: any) {
    alert(e.data?.message || '保存失败');
  }
}

async function addRule() {
  try {
    await $fetch('/api/filters', {
      method: 'POST',
      body: {
        type: newRule.value.type,
        topic: newRule.value.topic || undefined,
        description: newRule.value.description || undefined,
        titleKeywords: newRule.value.titleKeywords.split('\n').map(s => s.trim()).filter(Boolean),
        contentKeywords: newRule.value.contentKeywords.split('\n').map(s => s.trim()).filter(Boolean),
      },
    });
    showAddForm.value = false;
    newRule.value = { type: 'include', topic: '', description: '', titleKeywords: '', contentKeywords: '' };
    refresh();
    emit('changed');
  } catch (e: any) {
    alert(e.data?.message || '添加失败');
  }
}

async function deleteRule(id: number) {
  if (!confirm('确定删除此规则？')) return;
  await $fetch(`/api/filters/${id}`, { method: 'DELETE' });
  refresh();
  emit('changed');
}

async function toggleRule(id: number, enabled: boolean) {
  await $fetch(`/api/filters/${id}`, { method: 'PUT', body: { enabled: !enabled } });
  refresh();
}

// 目标公众号筛选（仅开发模式，用于调试）
const isDev = process.dev;
const targetSourceId = ref<string>('');
const { data: sourcesData } = await useFetch('/api/sources');
const sourceOptions = computed(() => {
  const sources = (sourcesData.value as any)?.sources || [];
  return [{ label: '全部公众号', value: '' }, ...sources.map((s: any) => ({ label: s.name, value: String(s.id) }))];
});

async function applyFilters() {
  applyLoading.value = true;
  applyResult.value = '';
  classifyProgress.value = null;
  classifyLogs.value = [];
  try {
    await runClassifyStream(false);
    emit('changed');
  } catch (e: any) {
    applyResult.value = `筛选失败：${e.message}`;
  } finally {
    applyLoading.value = false;
  }
}

const reapplyLoading = ref(false);
const classifyProgress = ref<{ current: number; total: number; accepted: number; rejected: number; phase: string; message: string } | null>(null);
const classifyLogs = ref<string[]>([]);

async function reapplyAll() {
  const msg = targetSourceId.value
    ? '将重置指定公众号的已分类文章并重新分类，确定继续？'
    : '将重置所有已分类文章并按当前规则重新分类（包含自动下载缺失正文），确定继续？';
  if (!confirm(msg)) return;
  reapplyLoading.value = true;
  applyResult.value = '';
  classifyProgress.value = null;
  classifyLogs.value = [];
  try {
    await runClassifyStream(true);
    emit('changed');
  } catch (e: any) {
    applyResult.value = `重新分类失败：${e.message}`;
  } finally {
    reapplyLoading.value = false;
  }
}

async function runClassifyStream(reapplyAll: boolean) {
  const bodyParams: any = { reapplyAll };
  if (targetSourceId.value) bodyParams.sourceId = Number(targetSourceId.value);

  const response = await fetch('/api/filters/apply-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyParams),
  });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

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
        if (data.type === 'phase') {
          classifyProgress.value = { current: 0, total: data.total || 0, accepted: 0, rejected: 0, phase: data.phase, message: data.message };
        } else if (data.type === 'progress') {
          const currentPhase = classifyProgress.value?.phase || 'classify';
          classifyProgress.value = { current: data.current, total: data.total, accepted: data.accepted || 0, rejected: data.rejected || 0, phase: currentPhase, message: '' };
          if (data.log) {
            classifyLogs.value.push(data.log);
            // 保留最近 200 条，避免内存溢出
            if (classifyLogs.value.length > 200) classifyLogs.value = classifyLogs.value.slice(-200);
          }
        } else if (data.type === 'done') {
          classifyProgress.value = null;
          applyResult.value = `分类完成：通过 ${data.accepted} 篇，排除 ${data.rejected} 篇，未匹配 ${data.pending} 篇`;
          // 分类完成后异步向量化（无论是否有新通过的文章，检查是否有待向量化的）
          console.log('[AdminFiltersTab] 分类完成，启动自动向量化');
          autoVectorizeInBackground();
        }
      } catch {}
    }
  }
}

async function handleImportRules(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  importLoading.value = true;
  importResult.value = '';
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const result = await $fetch('/api/filters/import', { method: 'POST', body: json });
    importResult.value = `导入成功：${result.imported} 条规则`;
    refresh();
  } catch (e: any) {
    importResult.value = `导入失败：${e.data?.message || e.message}`;
  } finally {
    importLoading.value = false;
    input.value = '';
  }
}

const includeRules = computed(() => data.value?.rules?.filter(r => r.type === 'include') || []);
const excludeRules = computed(() => data.value?.rules?.filter(r => r.type === 'exclude') || []);
</script>

<template>
  <div class="space-y-6 pt-4">
    <!-- 操作栏 -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <label class="cursor-pointer">
          <UButton as="span" :loading="importLoading" color="gray" size="sm">导入 JSON 规则</UButton>
          <input type="file" accept=".json" class="hidden" @change="handleImportRules" />
        </label>
        <UButton @click="showAddForm = !showAddForm" color="primary" size="sm">
          {{ showAddForm ? '取消' : '新增规则' }}
        </UButton>
      </div>
      <span v-if="importResult" class="text-sm" :class="importResult.includes('失败') ? 'text-red-500' : 'text-green-600'">
        {{ importResult }}
      </span>
    </div>

    <!-- 新增规则表单 -->
    <UCard v-if="showAddForm">
      <template #header>
        <h3 class="font-semibold">新增过滤规则</h3>
      </template>
      <div class="space-y-4">
        <div class="flex gap-4">
          <UFormGroup label="规则类型" class="w-40">
            <USelect v-model="newRule.type" :options="[{label:'正向(目标行业)',value:'include'},{label:'反向(排除)',value:'exclude'}]" value-attribute="value" option-attribute="label" />
          </UFormGroup>
          <UFormGroup v-if="newRule.type === 'include'" label="行业/主题" class="flex-1">
            <UInput v-model="newRule.topic" placeholder="如：海洋油气装备" />
          </UFormGroup>
          <UFormGroup label="描述" class="flex-1">
            <UInput v-model="newRule.description" placeholder="规则说明（可选）" />
          </UFormGroup>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <UFormGroup label="标题关键词（每行一个）">
            <UTextarea v-model="newRule.titleKeywords" :rows="5" placeholder="海洋油气装备&#10;FPSO&#10;深海采矿" />
          </UFormGroup>
          <UFormGroup label="正文关键词（每行一个）">
            <UTextarea v-model="newRule.contentKeywords" :rows="5" placeholder="国际合作&#10;技术转让&#10;战略合作" />
          </UFormGroup>
        </div>
        <UButton @click="addRule" color="primary">保存规则</UButton>
      </div>
    </UCard>

    <!-- 执行筛选 -->
    <UCard>
      <template #header>
        <h3 class="font-semibold">执行筛选</h3>
      </template>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        <!-- 对所有"待筛选"状态的文章应用过滤规则。先检查反向规则排除，再检查正向规则匹配目标行业。<br><br> -->
        "执行筛选"会保留现有已归类的文章，"重新分类"则所有文章按照最新规则重新覆盖分类。
      </p>
      <div class="flex items-center gap-4 flex-wrap">
        <UButton @click="applyFilters" :loading="applyLoading" color="green">
          执行筛选
        </UButton>
        <UButton @click="reapplyAll" :loading="reapplyLoading" color="orange" variant="soft">
          重新分类全部
        </UButton>
        <USelect v-model="targetSourceId" :options="sourceOptions" value-attribute="value" option-attribute="label" class="w-44" size="sm" />
        <span v-if="applyResult" class="text-sm" :class="applyResult.includes('失败') ? 'text-red-500' : 'text-green-600'">
          {{ applyResult }}
        </span>
      </div>
      <!-- 分类日志 -->
      <div v-if="classifyLogs.length > 0" class="mt-4 max-h-48 overflow-y-auto rounded bg-gray-900 dark:bg-gray-950 p-3 font-mono text-xs text-gray-300 space-y-0.5">
        <div v-for="(log, idx) in classifyLogs.slice(-50)" :key="idx" :class="{
          'text-green-400': log.startsWith('✅'),
          'text-red-400': log.startsWith('❌'),
          'text-blue-400': log.startsWith('🤖'),
          'text-gray-500': log.startsWith('⏸️'),
        }">{{ log }}</div>
      </div>
      <!-- 分类进度条 -->
      <div v-if="classifyProgress" class="mt-4 space-y-2">
        <div class="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>{{ classifyProgress.phase === 'download' ? '下载正文' : '分类中' }}</span>
          <span v-if="classifyProgress.total > 0">{{ classifyProgress.current }}/{{ classifyProgress.total }}</span>
        </div>
        <UProgress
          :value="classifyProgress.total > 0 ? Math.round(classifyProgress.current / classifyProgress.total * 100) : undefined"
          size="sm"
        />
        <p v-if="classifyProgress.message" class="text-xs text-gray-500">{{ classifyProgress.message }}</p>
        <p v-if="classifyProgress.phase === 'classify'" class="text-xs text-gray-500">
          通过 {{ classifyProgress.accepted }} · 排除 {{ classifyProgress.rejected }}
        </p>
      </div>
    </UCard>

    <!-- 正向规则列表 -->
    <UCard>
      <template #header>
        <h3 class="font-semibold text-green-700 dark:text-green-400">正向规则（目标行业）</h3>
      </template>
      <div v-if="includeRules.length" class="space-y-4">
        <div v-for="rule in includeRules" :key="rule.id" class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <!-- 编辑模式 -->
          <div v-if="editingId === rule.id" class="space-y-4">
            <div class="flex gap-4">
              <UFormGroup label="行业/主题" class="flex-1">
                <UInput v-model="editForm.topic" placeholder="如：海洋油气装备" />
              </UFormGroup>
              <UFormGroup label="描述" class="flex-1">
                <UInput v-model="editForm.description" placeholder="规则说明（可选）" />
              </UFormGroup>
              <UFormGroup label="优先级" class="w-24">
                <UInput v-model.number="editForm.priority" type="number" :min="1" placeholder="99" />
              </UFormGroup>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <UFormGroup label="标题关键词（每行一个）">
                <UTextarea v-model="editForm.titleKeywords" :rows="6" />
              </UFormGroup>
              <UFormGroup label="正文关键词（每行一个）">
                <UTextarea v-model="editForm.contentKeywords" :rows="6" />
              </UFormGroup>
            </div>
            <!-- 组合匹配 -->
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
              <div class="flex items-center gap-3">
                <UCheckbox v-model="editForm.requireAll" label="启用组合匹配" />
                <span class="text-xs text-gray-500">启用后，文章必须同时命中所有分组中各至少一个词才算匹配</span>
              </div>
              <div v-if="editForm.requireAll">
                <UFormGroup label="关键词分组（每行一组，组内关键词用顿号或逗号分隔）">
                  <UTextarea
                    v-model="editForm.groups"
                    :rows="4"
                    placeholder="油气、海洋油气、海上油气、offshore oil&#10;装备、设备、平台、船舶、FPSO、rig、vessel"
                  />
                </UFormGroup>
                <p class="text-xs text-gray-400 mt-1">示例：第一行是"油气领域词"，第二行是"装备概念词"，文章需同时命中两组</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <UButton @click="saveEdit(rule.id)" color="primary" size="sm">保存</UButton>
              <UButton @click="cancelEdit" color="gray" size="sm" variant="ghost">取消</UButton>
            </div>
          </div>
          <!-- 展示模式 -->
          <div v-else>
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="font-medium">{{ rule.topic }}</span>
                <UBadge :color="rule.enabled ? 'green' : 'gray'" size="xs">
                  {{ rule.enabled ? '启用' : '禁用' }}
                </UBadge>
              </div>
              <div class="flex items-center gap-2">
                <UButton @click="startEdit(rule)" size="xs" color="blue" variant="ghost">编辑</UButton>
                <UButton @click="toggleRule(rule.id, rule.enabled)" size="xs" color="gray" variant="ghost">
                  {{ rule.enabled ? '禁用' : '启用' }}
                </UButton>
                <UButton @click="deleteRule(rule.id)" size="xs" color="red" variant="ghost">删除</UButton>
              </div>
            </div>
            <p v-if="rule.description" class="text-sm text-gray-500 mb-2">{{ rule.description }}</p>
            <div class="flex gap-4 text-xs text-gray-400">
              <span>标题关键词: {{ (rule.titleKeywords as string[]).length }} 个</span>
              <span>正文关键词: {{ (rule.contentKeywords as string[]).length }} 个</span>
              <span v-if="rule.priority && rule.priority < 99">优先级: {{ rule.priority }}</span>
              <UBadge v-if="rule.requireAll" color="orange" size="xs" variant="subtle">组合匹配</UBadge>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="text-sm text-gray-500">暂无正向规则</div>
    </UCard>

    <!-- 反向规则列表 -->
    <UCard>
      <template #header>
        <h3 class="font-semibold text-red-700 dark:text-red-400">反向规则（排除）</h3>
      </template>
      <div v-if="excludeRules.length" class="space-y-4">
        <div v-for="rule in excludeRules" :key="rule.id" class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <!-- 编辑模式 -->
          <div v-if="editingId === rule.id" class="space-y-4">
            <div class="flex gap-4">
              <UFormGroup label="名称" class="flex-1">
                <UInput v-model="editForm.topic" placeholder="排除规则名称" />
              </UFormGroup>
              <UFormGroup label="描述" class="flex-1">
                <UInput v-model="editForm.description" placeholder="规则说明（可选）" />
              </UFormGroup>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <UFormGroup label="标题排除关键词（每行一个）">
                <UTextarea v-model="editForm.titleKeywords" :rows="6" />
              </UFormGroup>
              <UFormGroup label="正文排除关键词（每行一个）">
                <UTextarea v-model="editForm.contentKeywords" :rows="6" />
              </UFormGroup>
            </div>
            <div class="flex items-center gap-2">
              <UButton @click="saveEdit(rule.id)" color="primary" size="sm">保存</UButton>
              <UButton @click="cancelEdit" color="gray" size="sm" variant="ghost">取消</UButton>
            </div>
          </div>
          <!-- 展示模式 -->
          <div v-else>
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="font-medium">{{ rule.topic || '排除规则' }}</span>
                <UBadge :color="rule.enabled ? 'green' : 'gray'" size="xs">
                  {{ rule.enabled ? '启用' : '禁用' }}
                </UBadge>
              </div>
              <div class="flex items-center gap-2">
                <UButton @click="startEdit(rule)" size="xs" color="blue" variant="ghost">编辑</UButton>
                <UButton @click="toggleRule(rule.id, rule.enabled)" size="xs" color="gray" variant="ghost">
                  {{ rule.enabled ? '禁用' : '启用' }}
                </UButton>
                <UButton @click="deleteRule(rule.id)" size="xs" color="red" variant="ghost">删除</UButton>
              </div>
            </div>
            <div class="text-sm text-gray-600 dark:text-gray-400">
              <div class="flex flex-wrap gap-1 mt-1">
                <UBadge v-for="kw in (rule.titleKeywords as string[]).slice(0, 15)" :key="kw" color="red" size="xs" variant="subtle">
                  {{ kw }}
                </UBadge>
                <span v-if="(rule.titleKeywords as string[]).length > 15" class="text-xs text-gray-400">
                  +{{ (rule.titleKeywords as string[]).length - 15 }} 更多
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="text-sm text-gray-500">暂无反向规则</div>
    </UCard>
  </div>
</template>
