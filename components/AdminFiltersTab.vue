<script setup lang="ts">
const emit = defineEmits<{
  changed: [];
}>();

const { data, refresh } = await useFetch('/api/filters');

const applyLoading = ref(false);
const applyResult = ref('');
const importLoading = ref(false);
const importResult = ref('');

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
});

function startEdit(rule: any) {
  editingId.value = rule.id;
  editForm.value = {
    topic: rule.topic || '',
    description: rule.description || '',
    titleKeywords: (rule.titleKeywords as string[]).join('\n'),
    contentKeywords: (rule.contentKeywords as string[]).join('\n'),
  };
}

function cancelEdit() {
  editingId.value = null;
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

async function applyFilters() {
  applyLoading.value = true;
  applyResult.value = '';
  try {
    const result = await $fetch('/api/filters/apply', { method: 'POST' });
    applyResult.value = `筛选完成：通过 ${result.accepted} 篇，排除 ${result.rejected} 篇，未匹配 ${result.pending} 篇`;
    emit('changed');
  } catch (e: any) {
    applyResult.value = `筛选失败：${e.data?.message || e.message}`;
  } finally {
    applyLoading.value = false;
  }
}

const reapplyLoading = ref(false);

async function reapplyAll() {
  if (!confirm('将重置所有已分类文章并按当前规则重新分类，确定继续？')) return;
  reapplyLoading.value = true;
  applyResult.value = '';
  try {
    const result = await $fetch('/api/filters/apply', { method: 'POST', body: { reapplyAll: true } });
    applyResult.value = `重新分类完成：通过 ${result.accepted} 篇，排除 ${result.rejected} 篇，未匹配 ${result.pending} 篇`;
    emit('changed');
  } catch (e: any) {
    applyResult.value = `重新分类失败：${e.data?.message || e.message}`;
  } finally {
    reapplyLoading.value = false;
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
        对所有"待筛选"状态的文章应用过滤规则。先检查反向规则排除，再检查正向规则匹配目标行业。
      </p>
      <div class="flex items-center gap-4">
        <UButton @click="applyFilters" :loading="applyLoading" color="green">
          执行筛选
        </UButton>
        <UButton @click="reapplyAll" :loading="reapplyLoading" color="orange" variant="soft">
          重新分类全部
        </UButton>
        <span v-if="applyResult" class="text-sm" :class="applyResult.includes('失败') ? 'text-red-500' : 'text-green-600'">
          {{ applyResult }}
        </span>
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
            </div>
            <div class="grid grid-cols-2 gap-4">
              <UFormGroup label="标题关键词（每行一个）">
                <UTextarea v-model="editForm.titleKeywords" :rows="6" />
              </UFormGroup>
              <UFormGroup label="正文关键词（每行一个）">
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
