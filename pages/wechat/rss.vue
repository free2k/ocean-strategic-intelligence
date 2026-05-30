<script setup lang="ts">
const toast = useToast();

interface RssSource {
  id: number;
  name: string;
  alias: string | null; // RSS URL
  createdAt: string;
}

// Sources
const sources = ref<RssSource[]>([]);
const loadingSources = ref(false);

// Add form
const newName = ref('');
const newUrl = ref('');
const adding = ref(false);

// Sync state
const syncingIds = ref<Set<number>>(new Set());
const syncResults = ref<Map<number, string>>(new Map());

// Sync options modal
const showSyncModal = ref(false);
const syncTarget = ref<RssSource | null>(null);
const syncMaxArticles = ref<number | undefined>(50);
const syncSinceDate = ref('');
const syncAll = ref(false);

// Delete
const showDeleteModal = ref(false);
const deleteTarget = ref<RssSource | null>(null);
const deleting = ref(false);

// Edit URL
const editingId = ref<number | null>(null);
const editUrl = ref('');

// Load sources
async function loadSources() {
  loadingSources.value = true;
  try {
    const data = await $fetch<{ list: RssSource[] }>('/api/rss/sources');
    sources.value = data.list;
  } catch (error: any) {
    toast.add({ title: '加载失败', description: error?.message, color: 'red' });
  } finally {
    loadingSources.value = false;
  }
}

// Add source
async function addSource() {
  if (!newName.value.trim() || !newUrl.value.trim()) {
    toast.add({ title: '请填写完整', description: '名称和 RSS 地址不能为空', color: 'yellow' });
    return;
  }
  adding.value = true;
  try {
    const result = await $fetch<{ success: boolean; created: boolean }>('/api/rss/sources', {
      method: 'POST',
      body: { name: newName.value.trim(), url: newUrl.value.trim() },
    });
    if (result.created) {
      toast.add({ title: '添加成功', color: 'green' });
    } else {
      toast.add({ title: '该 RSS 源已存在', color: 'yellow' });
    }
    newName.value = '';
    newUrl.value = '';
    await loadSources();
  } catch (error: any) {
    toast.add({ title: '添加失败', description: error?.message, color: 'red' });
  } finally {
    adding.value = false;
  }
}

// Open sync modal
function openSyncModal(source: RssSource) {
  syncTarget.value = source;
  syncMaxArticles.value = 50;
  syncSinceDate.value = '';
  syncAll.value = false;
  showSyncModal.value = true;
}

// Execute sync
async function executeSyncFromModal() {
  if (!syncTarget.value) return;
  showSyncModal.value = false;
  await syncSource(syncTarget.value);
}

// Quick sync (default 50)
async function quickSync(source: RssSource) {
  syncMaxArticles.value = undefined;
  syncSinceDate.value = '';
  syncAll.value = false;
  await syncSource(source);
}

// Sync a source
async function syncSource(source: RssSource) {
  syncingIds.value.add(source.id);
  syncResults.value.delete(source.id);

  try {
    const body: any = { sourceId: source.id };
    if (!syncAll.value && syncMaxArticles.value && syncMaxArticles.value > 0) {
      body.maxArticles = syncMaxArticles.value;
    } else if (syncAll.value) {
      body.maxArticles = 0; // 0 means no limit
    }
    if (syncSinceDate.value) {
      body.sinceDate = new Date(syncSinceDate.value).toISOString();
    }

    const result = await $fetch<{ imported: number; skipped: number; failed: number; total: number }>('/api/rss/sync', {
      method: 'POST',
      body,
    });

    syncResults.value.set(source.id, `新增 ${result.imported}，跳过 ${result.skipped}，失败 ${result.failed}`);
    toast.add({ title: '同步完成', description: `${source.name}: 新增 ${result.imported} 篇`, color: 'green' });
  } catch (error: any) {
    syncResults.value.set(source.id, `失败: ${error?.data?.message || error?.message}`);
    toast.add({ title: '同步失败', description: error?.data?.message || error?.message, color: 'red' });
  } finally {
    syncingIds.value.delete(source.id);
  }
}

// Delete
function confirmDelete(source: RssSource) {
  deleteTarget.value = source;
  showDeleteModal.value = true;
}

// Edit URL
function startEditUrl(source: RssSource) {
  editingId.value = source.id;
  editUrl.value = source.alias || '';
}

async function saveUrl(source: RssSource) {
  if (!editUrl.value.trim()) {
    toast.add({ title: '请填写 RSS 地址', color: 'yellow' });
    return;
  }
  try {
    await $fetch(`/api/rss/sources/${source.id}`, {
      method: 'PATCH',
      body: { url: editUrl.value.trim() },
    });
    toast.add({ title: 'URL 已更新', color: 'green' });
    editingId.value = null;
    await loadSources();
  } catch (error: any) {
    toast.add({ title: '更新失败', description: error?.message, color: 'red' });
  }
}

async function executeDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  try {
    await $fetch(`/api/rss/sources/${deleteTarget.value.id}`, { method: 'DELETE' });
    toast.add({ title: '删除成功', color: 'green' });
    showDeleteModal.value = false;
    deleteTarget.value = null;
    await loadSources();
  } catch (error: any) {
    toast.add({ title: '删除失败', description: error?.message, color: 'red' });
  } finally {
    deleting.value = false;
  }
}

onMounted(() => {
  loadSources();
});
</script>

<template>
  <div class="space-y-6 overflow-hidden">
    <h2 class="text-xl font-bold">RSS 订阅管理</h2>

    <!-- Add RSS source form -->
    <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
      <h3 class="text-sm font-medium">添加 RSS 订阅源</h3>
      <div class="flex items-end gap-3 flex-wrap">
        <div class="flex-1 min-w-[200px]">
          <label class="block text-xs text-gray-500 mb-1">渠道名称</label>
          <UInput v-model="newName" placeholder="例如: 36氪" />
        </div>
        <div class="flex-[2] min-w-[300px]">
          <label class="block text-xs text-gray-500 mb-1">RSS 地址</label>
          <UInput v-model="newUrl" placeholder="https://example.com/feed.xml" />
        </div>
        <UButton icon="i-heroicons-plus" color="primary" :loading="adding" @click="addSource">
          添加
        </UButton>
      </div>
    </div>

    <!-- RSS sources list -->
    <div class="space-y-3">
      <h3 class="text-sm font-medium">已添加的订阅源</h3>

      <div v-if="loadingSources" class="text-gray-500 text-sm">加载中...</div>
      <div v-else-if="sources.length === 0" class="text-gray-500 text-sm py-4">暂无订阅源，请通过上方表单添加。</div>

      <div v-else class="space-y-2">
        <div
          v-for="source in sources"
          :key="source.id"
          class="flex items-center justify-between p-4 rounded-lg border dark:border-gray-700"
        >
          <div class="min-w-0 flex-1">
            <p class="font-medium">{{ source.name }}</p>
            <!-- Show URL or edit form -->
            <template v-if="editingId === source.id">
              <div class="flex items-center gap-2 mt-1">
                <UInput v-model="editUrl" placeholder="https://example.com/feed.xml" size="sm" class="flex-1" />
                <UButton size="xs" color="primary" @click="saveUrl(source)">保存</UButton>
                <UButton size="xs" color="gray" variant="ghost" @click="editingId = null">取消</UButton>
              </div>
            </template>
            <template v-else>
              <p v-if="source.alias" class="text-xs text-gray-500 truncate">{{ source.alias }}</p>
              <p v-else class="text-xs text-yellow-500 cursor-pointer" @click="startEditUrl(source)">
                ⚠ 缺少 RSS 地址，点击补填
              </p>
            </template>
            <p v-if="syncResults.get(source.id)" class="text-xs mt-1" :class="syncResults.get(source.id)!.startsWith('失败') ? 'text-red-500' : 'text-green-500'">
              {{ syncResults.get(source.id) }}
            </p>
          </div>
          <div class="flex items-center gap-2 ml-4 shrink-0">
            <UButton
              icon="i-heroicons-arrow-path"
              color="blue"
              variant="ghost"
              size="xs"
              :loading="syncingIds.has(source.id)"
              @click="quickSync(source)"
            >
              同步
            </UButton>
            <UButton
              icon="i-heroicons-cog-6-tooth"
              color="gray"
              variant="ghost"
              size="xs"
              @click="openSyncModal(source)"
              title="同步设置"
            />
            <UButton
              icon="i-heroicons-trash"
              color="red"
              variant="ghost"
              size="xs"
              @click="confirmDelete(source)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Sync options modal -->
    <UModal v-model="showSyncModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">同步设置 - {{ syncTarget?.name }}</h3>
        </template>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1">最大文章数</label>
            <div class="flex items-center gap-3">
              <UInput v-model.number="syncMaxArticles" type="number" placeholder="默认: 50" :min="1" :disabled="syncAll" class="flex-1" />
              <UCheckbox v-model="syncAll" label="全部" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">起始日期（只同步该日期之后的文章）</label>
            <UInput v-model="syncSinceDate" type="date" />
          </div>
        </div>
        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton color="gray" variant="ghost" @click="showSyncModal = false">取消</UButton>
            <UButton color="primary" @click="executeSyncFromModal">开始同步</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Delete modal -->
    <UModal v-model="showDeleteModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">确认删除</h3>
        </template>
        <p>确定要删除订阅源 <strong>{{ deleteTarget?.name }}</strong> 吗？</p>
        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton color="gray" variant="ghost" @click="showDeleteModal = false">取消</UButton>
            <UButton color="red" :loading="deleting" @click="executeDelete">确认删除</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
