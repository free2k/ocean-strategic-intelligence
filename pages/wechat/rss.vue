<script setup lang="ts">
const toast = useToast();

interface RssSource {
  id: number | string;
  name: string;
  alias: string | null; // RSS URL
  isOverseas: boolean;
  createdAt: string;
  manager: string;
  method: string;
  count: number;
  localCount?: number;
  sitemap?: string;
  sitemapStatus?: string;
  sitemapCheckedAt?: string;
  status?: string;
  checkedAt?: string;
  error?: string;
  scope?: string;
}

// Sources
const sources = ref<RssSource[]>([]);
const loadingSources = ref(false);
const sourceSearch = ref('');
const sourceKind = ref('all');
const visibleSources = computed(()=>sources.value.filter(s=>(sourceKind.value==='all'||(sourceKind.value==='rss'?s.method==='rss':s.method!=='rss'))&&s.name.toLowerCase().includes(sourceSearch.value.trim().toLowerCase())));
const manualSources = computed(()=>sources.value.filter(s=>s.manager==='rss'));
const statusLabels:Record<string,string>={ready:'最近检查成功',partial:'部分采集成功',failed:'访问失败，待重试',unverified:'待检查'};
const methodLabels:Record<string,string>={rss:'RSS / Atom',web:'官网文章', 'web-index':'网页索引','web-pdf':'网页 / PDF','web-table':'网页数据表',csv:'CSV 数据','authenticated-xlsx':'Excel 数据集'};
const date=(value?:string)=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'尚无检查记录';

// Add form
const newName = ref('');
const newUrl = ref('');
const adding = ref(false);

// Batch import
const showBatchModal = ref(false);
const batchText = ref('');
const batchImporting = ref(false);

// Sync state
const syncingIds = ref<Set<number|string>>(new Set());
const syncResults = ref<Map<number|string, string>>(new Map());

// 批量同步
const batchSyncing = ref(false);
const batchSyncProgress = ref<{ current: number; total: number; currentName: string } | null>(null);

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
const editingId = ref<number | string | null>(null);
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

// Batch import RSS sources (format: name\nurl\nname\nurl...)
async function batchImport() {
  const lines = batchText.value.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    toast.add({ title: '格式错误', description: '请按"名称\\nURL"交替填写，至少一组', color: 'yellow' });
    return;
  }

  const pairs: { name: string; url: string }[] = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    const name = lines[i];
    const url = lines[i + 1];
    if (name && url && (url.startsWith('http://') || url.startsWith('https://'))) {
      pairs.push({ name, url });
    }
  }

  if (pairs.length === 0) {
    toast.add({ title: '未识别到有效数据', description: '请确保格式为：名称换行后跟URL', color: 'yellow' });
    return;
  }

  batchImporting.value = true;
  let created = 0;
  let skipped = 0;

  try {
    for (const pair of pairs) {
      try {
        const result = await $fetch<{ success: boolean; created: boolean }>('/api/rss/sources', {
          method: 'POST',
          body: { name: pair.name, url: pair.url },
        });
        if (result.created) created++;
        else skipped++;
      } catch {
        skipped++;
      }
    }
    toast.add({ title: '批量导入完成', description: `新增 ${created} 个，跳过 ${skipped} 个`, color: 'green' });
    batchText.value = '';
    showBatchModal.value = false;
    await loadSources();
  } catch (error: any) {
    toast.add({ title: '导入失败', description: error?.message, color: 'red' });
  } finally {
    batchImporting.value = false;
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

// 批量同步所有订阅源
async function batchSyncAll() {
  if (sources.value.length === 0) return;
  batchSyncing.value = true;
  const targets = manualSources.value.filter(s => s.alias);
  batchSyncProgress.value = { current: 0, total: targets.length, currentName: '' };

  let totalImported = 0;
  let totalFailed = 0;

  for (let i = 0; i < targets.length; i++) {
    const source = targets[i];
    batchSyncProgress.value = { current: i + 1, total: targets.length, currentName: source.name };
    syncingIds.value.add(source.id);
    syncResults.value.delete(source.id);

    try {
      const result = await $fetch<{ imported: number; skipped: number; failed: number; total: number }>('/api/rss/sync', {
        method: 'POST',
        body: { sourceId: source.id },
      });
      syncResults.value.set(source.id, `新增 ${result.imported}，跳过 ${result.skipped}`);
      totalImported += result.imported;
    } catch (error: any) {
      syncResults.value.set(source.id, `失败: ${error?.data?.message || error?.message}`);
      totalFailed++;
    } finally {
      syncingIds.value.delete(source.id);
    }
  }

  batchSyncProgress.value = null;
  batchSyncing.value = false;
  toast.add({
    title: '批量同步完成',
    description: `${targets.length} 个源同步完成，共新增 ${totalImported} 篇${totalFailed > 0 ? `，${totalFailed} 个失败` : ''}`,
    color: totalFailed > 0 ? 'yellow' : 'green',
  });
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

// Toggle overseas flag
async function toggleOverseas(source: RssSource) {
  try {
    await $fetch(`/api/sources/${source.id}/overseas`, {
      method: 'PATCH',
      body: { isOverseas: !source.isOverseas },
    });
    source.isOverseas = !source.isOverseas;
    toast.add({ title: source.isOverseas ? '已标记为外网来源' : '已取消外网标记', color: 'green' });
  } catch (error: any) {
    toast.add({ title: '操作失败', description: error?.message, color: 'red' });
  }
}

onMounted(() => {
  loadSources();
});
</script>

<template>
  <div class="space-y-6 overflow-hidden">
    <h2 class="text-xl font-bold">RSS 与外部采集源</h2>
    <p class="text-sm text-gray-500">统一展示 RSS、站点地图、官网文章及官方数据集。相同地址合并显示；TodayRSS 旧源已停用，其历史文章保留在入库文章中。</p>
    <div class="flex flex-wrap gap-3"><UInput v-model="sourceSearch" placeholder="搜索来源名称"/><USelect v-model="sourceKind" :options="[{label:'全部采集方式',value:'all'},{label:'RSS / Atom',value:'rss'},{label:'官网 / 数据集',value:'other'}]"/><span class="text-sm text-gray-500 self-center">{{visibleSources.length}} 个来源</span><UButton variant="ghost" :loading="loadingSources" @click="loadSources">刷新状态</UButton></div>

    <!-- Add RSS source form -->
    <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-medium">添加 RSS 订阅源</h3>
        <UButton icon="i-heroicons-arrow-up-tray" color="blue" variant="soft" size="xs" @click="showBatchModal = true">
          批量导入
        </UButton>
      </div>
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
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-medium">已添加的订阅源</h3>
        <UButton
          icon="i-heroicons-arrow-path"
          color="blue"
          variant="soft"
          size="sm"
          :loading="batchSyncing"
          :disabled="batchSyncing || manualSources.length === 0"
          @click="batchSyncAll"
        >
          同步普通 RSS ({{ manualSources.length }})
        </UButton>
      </div>

      <!-- 批量同步进度 -->
      <div v-if="batchSyncProgress" class="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <UProgress :value="Math.round(batchSyncProgress.current / batchSyncProgress.total * 100)" size="sm" class="flex-1" />
        <span class="text-sm text-blue-600 dark:text-blue-400 whitespace-nowrap">
          {{ batchSyncProgress.current }}/{{ batchSyncProgress.total }} · {{ batchSyncProgress.currentName }}
        </span>
      </div>

      <div v-if="loadingSources" class="text-gray-500 text-sm">加载中...</div>
      <div v-else-if="sources.length === 0" class="text-gray-500 text-sm py-4">暂无订阅源，请通过上方表单添加。</div>

      <div v-else class="space-y-2">
        <div
          v-for="source in visibleSources"
          :key="source.id"
          class="flex flex-wrap gap-3 items-center justify-between p-4 rounded-lg border dark:border-gray-700"
        >
          <div class="min-w-0 flex-1">
            <p class="font-medium">
              {{ source.name }}
              <UBadge v-if="source.isOverseas" color="orange" size="xs" variant="subtle" class="ml-1">外网</UBadge>
              <UBadge color="gray" size="xs" variant="soft" class="ml-1">{{methodLabels[source.method]||source.method}}</UBadge>
            </p>
            <!-- Show URL or edit form -->
            <template v-if="editingId === source.id">
              <div class="flex items-center gap-2 mt-1">
                <UInput v-model="editUrl" placeholder="https://example.com/feed.xml" size="sm" class="flex-1" />
                <UButton size="xs" color="primary" @click="saveUrl(source)">保存</UButton>
                <UButton size="xs" color="gray" variant="ghost" @click="editingId = null">取消</UButton>
              </div>
            </template>
            <template v-else>
              <a v-if="source.alias" :href="source.alias" target="_blank" rel="noopener noreferrer" class="block text-xs text-primary-500 break-all mt-1">{{ source.alias }} ↗</a>
              <p v-else class="text-xs text-yellow-500 cursor-pointer" @click="startEditUrl(source)">
                ⚠ 缺少 RSS 地址，点击补填
              </p>
            </template>
            <a v-if="source.sitemap" :href="source.sitemap" target="_blank" rel="noopener noreferrer" class="block text-xs text-primary-500 break-all mt-2">站点地图：{{source.sitemap}} ↗</a>
            <p v-if="source.sitemapStatus" class="text-xs text-gray-500 mt-1">站点地图 {{statusLabels[source.sitemapStatus]||source.sitemapStatus}} · {{date(source.sitemapCheckedAt)}}</p>
            <p class="text-xs text-gray-500 mt-2">{{source.manager==='intelligence'?'智库文档':'入库文章'}} {{source.count||0}} 篇<span v-if="source.localCount"> · 普通文章库另有 {{source.localCount}} 篇（两库可能重叠，不相加）</span> · {{statusLabels[source.status||'unverified']||source.status}} · {{date(source.checkedAt)}}</p>
            <p v-if="source.error" class="text-xs text-orange-500 mt-1">{{source.error}}</p>
            <p v-if="source.scope" class="text-xs text-gray-500 mt-1">{{source.scope}}</p>
            <p class="text-xs text-gray-500 mt-1">{{source.manager==='intelligence'?'由智库定时采集，更新周期按来源计划执行；当前状态不代表全部文章均有正文。':source.manager==='oilprice'?'由 OilPrice 专用任务采集并处理文章证据。':'普通 RSS：可在本页手动同步。'}}</p>
            <p v-if="syncResults.get(source.id)" class="text-xs mt-1" :class="syncResults.get(source.id)!.startsWith('失败') ? 'text-red-500' : 'text-green-500'">
              {{ syncResults.get(source.id) }}
            </p>
          </div>
          <div v-if="source.manager==='rss'" class="flex items-center gap-2 ml-4 shrink-0">
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
            <UTooltip :text="source.isOverseas ? '当前为外网渠道，导出时归入「外网资讯」分类' : '开启后该来源文章将归入「外网资讯」分类'">
              <div class="flex items-center gap-1.5">
                <UToggle
                  :model-value="source.isOverseas"
                  size="sm"
                  on-icon="i-heroicons-globe-alt"
                  off-icon="i-heroicons-globe-americas"
                  :ui="{ active: 'bg-orange-500 dark:bg-orange-400' }"
                  @update:model-value="toggleOverseas(source)"
                />
                <span class="text-xs" :class="source.isOverseas ? 'text-orange-500 font-medium' : 'text-gray-400'">外网</span>
              </div>
            </UTooltip>
            <UButton
              icon="i-heroicons-trash"
              color="red"
              variant="ghost"
              size="xs"
              @click="confirmDelete(source)"
            />
          </div>
          <a v-else href="/ocean-intelligence/#sources" class="text-xs text-primary-500 px-3 py-2 rounded border border-gray-700">查看采集进度 →</a>
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

    <!-- Batch import modal -->
    <UModal v-model="showBatchModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">批量导入 RSS 订阅源</h3>
        </template>
        <div class="space-y-3">
          <p class="text-sm text-gray-500">
            每两行为一组：第一行为渠道名称，第二行为 RSS 地址。示例：
          </p>
          <pre class="text-xs bg-gray-100 dark:bg-gray-800 rounded p-3 text-gray-600 dark:text-gray-400 overflow-x-auto">Offshore Energy
https://www.offshore-energy.biz/feed/
BOEM 新闻
https://www.boem.gov/webteam/rss/boem-rss.xml</pre>
          <UTextarea
            v-model="batchText"
            :rows="10"
            placeholder="渠道名称&#10;RSS地址&#10;渠道名称&#10;RSS地址&#10;..."
          />
        </div>
        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton color="gray" variant="ghost" @click="showBatchModal = false">取消</UButton>
            <UButton color="primary" :loading="batchImporting" @click="batchImport">确认导入</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
