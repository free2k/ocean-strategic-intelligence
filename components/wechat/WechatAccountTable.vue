<script setup lang="ts">
const { authKey, isLoggedIn, initFromStorage } = useWechatAuth();
const toast = useToast();

// Login modal for prompting login
const showLoginPrompt = ref(false);

function requireLogin(): boolean {
  if (!isLoggedIn.value) {
    showLoginPrompt.value = true;
    return false;
  }
  return true;
}

interface Account {
  id: number;
  fakeid: string | null;
  name: string;
  alias: string | null;
  avatar: string | null;
  isOverseas: boolean;
  articleCount: number;
  lastSyncTime: string | null;
}

interface SearchResult {
  fakeid: string;
  nickname: string;
  alias: string;
  avatar: string;
  serviceType: number;
}

interface SyncTaskInfo {
  taskId: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  total: number;
  synced: number;
  currentPage: number;
  message?: string;
  elapsed: number;
}

// Data
const accounts = ref<Account[]>([]);
const loading = ref(false);
const selected = ref<Account[]>([]);

// Delete confirmation modal
const showDeleteModal = ref(false);
const deleteTarget = ref<Account | null>(null);
const deleting = ref(false);

// Add account search dialog
const showAddModal = ref(false);
const searchKeyword = ref('');
const searchResults = ref<SearchResult[]>([]);
const searching = ref(false);
const subscribing = ref<string | null>(null);

// Import modal
const showImportModal = ref(false);
const importFile = ref<File | null>(null);
const importing = ref(false);

// Sync state
const syncingIds = ref<Set<number>>(new Set());
const syncTasks = ref<Map<number, SyncTaskInfo>>(new Map());
const syncPollers = new Map<number, ReturnType<typeof setInterval>>();

// Sync options modal (single + batch)
const showSyncModal = ref(false);
const syncTarget = ref<Account | null>(null);
const syncIsBatch = ref(false);
const syncMaxArticles = ref<number | undefined>(undefined);
const syncSinceDate = ref('');

// Table columns - simplified to avoid overflow
const columns = [
  { key: 'index', label: '序号' },
  { key: 'avatar', label: '头像' },
  { key: 'name', label: '名称', sortable: true },
  { key: 'lastSyncTime', label: '最后同步时间', sortable: true },
  { key: 'articleCount', label: '文章数', sortable: true },
  { key: 'syncStatus', label: '同步状态' },
  { key: 'actions', label: '操作' },
];

// Load accounts
async function loadAccounts() {
  loading.value = true;
  try {
    const data = await $fetch<{ list: Account[] }>('/api/wechat/accounts');
    accounts.value = data.list;
  } catch (error: any) {
    toast.add({ title: '加载失败', description: error?.message || '无法加载公众号列表', color: 'red' });
  } finally {
    loading.value = false;
  }
}

// Open sync options modal for single account
function openSyncModal(account: Account) {
  if (!requireLogin()) return;
  syncTarget.value = account;
  syncIsBatch.value = false;
  syncMaxArticles.value = undefined;
  syncSinceDate.value = '';
  showSyncModal.value = true;
}

// Open sync options modal for batch
function openBatchSyncModal() {
  if (!requireLogin()) return;
  syncTarget.value = null;
  syncIsBatch.value = true;
  syncMaxArticles.value = undefined;
  syncSinceDate.value = '';
  showSyncModal.value = true;
}

// Start sync with options (single or batch)
async function startSync() {
  showSyncModal.value = false;
  if (syncIsBatch.value) {
    for (const account of selected.value) {
      await syncAccount(account);
    }
    selected.value = [];
  } else if (syncTarget.value) {
    await syncAccount(syncTarget.value);
  }
}

// Quick sync (no modal, sync latest 50)
async function quickSync(account: Account) {
  if (!requireLogin()) return;
  if (!account.fakeid) return;
  syncMaxArticles.value = undefined;
  syncSinceDate.value = '';
  await syncAccount(account);
}

// Sync account articles
async function syncAccount(account: Account) {
  if (!account.fakeid) return;
  syncingIds.value.add(account.id);

  try {
    const body: any = { fakeid: account.fakeid };
    if (syncMaxArticles.value && syncMaxArticles.value > 0) {
      body.maxArticles = syncMaxArticles.value;
    } else {
      body.maxArticles = 50;
    }
    if (syncSinceDate.value) {
      body.sinceDate = new Date(syncSinceDate.value).toISOString();
    }

    const result = await $fetch<{ taskId: string }>('/api/wechat/articles/sync', {
      method: 'POST',
      body,
      headers: authKey.value ? { 'X-Auth-Key': authKey.value } : undefined,
    });

    startProgressPolling(account.id, result.taskId);
  } catch (error: any) {
    syncingIds.value.delete(account.id);
    toast.add({ title: '同步失败', description: error?.data?.message || error?.message || '启动同步失败', color: 'red' });
  }
}

// Poll sync progress
function startProgressPolling(accountId: number, taskId: string) {
  if (syncPollers.has(accountId)) {
    clearInterval(syncPollers.get(accountId)!);
  }

  const poll = async () => {
    try {
      const progress = await $fetch<SyncTaskInfo>('/api/wechat/articles/sync-progress', {
        params: { taskId },
      });

      syncTasks.value.set(accountId, progress);

      if (progress.status !== 'running') {
        clearInterval(syncPollers.get(accountId)!);
        syncPollers.delete(accountId);
        syncingIds.value.delete(accountId);

        if (progress.status === 'completed') {
          toast.add({ title: '同步完成', description: `已同步 ${progress.synced} 篇文章`, color: 'green' });
        } else if (progress.status === 'failed') {
          toast.add({ title: '同步失败', description: progress.message || '同步过程中发生错误', color: 'red' });
        }

        await loadAccounts();
        setTimeout(() => { syncTasks.value.delete(accountId); }, 30000);
      }
    } catch {
      clearInterval(syncPollers.get(accountId)!);
      syncPollers.delete(accountId);
      syncingIds.value.delete(accountId);
    }
  };

  poll();
  const timer = setInterval(poll, 2000);
  syncPollers.set(accountId, timer);
}

// Stop sync
async function stopSync(accountId: number) {
  const task = syncTasks.value.get(accountId);
  if (!task) return;
  try {
    await $fetch('/api/wechat/articles/sync-stop', { method: 'POST', body: { taskId: task.taskId } });
    toast.add({ title: '已停止同步', color: 'yellow' });
  } catch (error: any) {
    toast.add({ title: '停止失败', description: error?.message, color: 'red' });
  }
}

// Get sync progress text
function getSyncStatusText(accountId: number): string {
  const task = syncTasks.value.get(accountId);
  if (!task) return '';
  if (task.status === 'running') {
    const percent = task.total > 0 ? Math.round((task.synced / task.total) * 100) : 0;
    return `${task.synced}/${task.total} (${percent}%) · 第${task.currentPage}页 · ${task.elapsed}s`;
  }
  if (task.status === 'completed') return `✓ ${task.synced}篇`;
  if (task.status === 'failed') return `✗ ${task.message}`;
  if (task.status === 'stopped') return `⏸ ${task.synced}篇`;
  return '';
}

// Delete
function confirmDelete(account: Account) {
  deleteTarget.value = account;
  showDeleteModal.value = true;
}

async function executeDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  try {
    await $fetch(`/api/wechat/accounts/${deleteTarget.value.id}`, { method: 'DELETE' });
    toast.add({ title: '删除成功', description: `已删除 ${deleteTarget.value.name}`, color: 'green' });
    showDeleteModal.value = false;
    deleteTarget.value = null;
    selected.value = [];
    await loadAccounts();
  } catch (error: any) {
    toast.add({ title: '删除失败', description: error?.message || '删除公众号失败', color: 'red' });
  } finally {
    deleting.value = false;
  }
}

// Search
async function searchAccounts() {
  if (!searchKeyword.value.trim()) return;
  searching.value = true;
  try {
    const data = await $fetch<{ list: SearchResult[] }>('/api/wechat/accounts/search', {
      params: { keyword: searchKeyword.value },
      headers: authKey.value ? { 'X-Auth-Key': authKey.value } : undefined,
    });
    searchResults.value = data.list;
  } catch (error: any) {
    toast.add({ title: '搜索失败', description: error?.message || '搜索公众号失败', color: 'red' });
  } finally {
    searching.value = false;
  }
}

async function subscribeAccount(result: SearchResult) {
  subscribing.value = result.fakeid;
  try {
    await $fetch('/api/wechat/accounts/subscribe', {
      method: 'POST',
      body: { fakeid: result.fakeid, nickname: result.nickname, avatar: result.avatar, alias: result.alias },
    });
    toast.add({ title: '添加成功', description: `已添加 ${result.nickname}`, color: 'green' });
    showAddModal.value = false;
    searchKeyword.value = '';
    searchResults.value = [];
    await loadAccounts();
  } catch (error: any) {
    toast.add({ title: '添加失败', description: error?.message || '添加公众号失败', color: 'red' });
  } finally {
    subscribing.value = null;
  }
}

// Import
function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    importFile.value = target.files[0];
  }
}

async function executeImport() {
  if (!importFile.value) return;
  importing.value = true;
  try {
    const text = await importFile.value.text();
    const json = JSON.parse(text);
    const accountsData = Array.isArray(json) ? json : json.accounts || [];
    const data = await $fetch<{ total: number; created: number; skipped: number }>('/api/wechat/accounts/import', {
      method: 'POST',
      body: { accounts: accountsData },
    });
    toast.add({ title: '导入完成', description: `共 ${data.total} 个，新增 ${data.created} 个，跳过 ${data.skipped} 个`, color: 'green' });
    showImportModal.value = false;
    importFile.value = null;
    await loadAccounts();
  } catch (error: any) {
    toast.add({ title: '导入失败', description: error?.message || 'JSON 文件解析或导入失败', color: 'red' });
  } finally {
    importing.value = false;
  }
}

// Batch delete
async function batchDelete() {
  for (const account of selected.value) {
    try {
      await $fetch(`/api/wechat/accounts/${account.id}`, { method: 'DELETE' });
    } catch (error: any) {
      toast.add({ title: '删除失败', description: `删除 ${account.name} 失败`, color: 'red' });
    }
  }
  toast.add({ title: '批量删除完成', color: 'green' });
  selected.value = [];
  await loadAccounts();
}

// Format date
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Toggle overseas flag
async function toggleOverseas(account: Account) {
  try {
    await $fetch(`/api/sources/${account.id}/overseas`, {
      method: 'PATCH',
      body: { isOverseas: !account.isOverseas },
    });
    account.isOverseas = !account.isOverseas;
    toast.add({ title: account.isOverseas ? '已标记为外网来源' : '已取消外网标记', color: 'green' });
  } catch (error: any) {
    toast.add({ title: '操作失败', description: error?.message, color: 'red' });
  }
}

// Cleanup
onUnmounted(() => {
  for (const timer of syncPollers.values()) clearInterval(timer);
  syncPollers.clear();
});

onMounted(() => {
  initFromStorage();
  loadAccounts();
});
</script>

<template>
  <div class="space-y-4 overflow-hidden">
    <!-- Top action bar -->
    <div class="flex items-center gap-3 flex-wrap">
      <UButton icon="i-heroicons-plus" color="primary" @click="requireLogin() && (showAddModal = true)">
        添加
      </UButton>
      <UButton icon="i-heroicons-arrow-up-tray" color="gray" variant="solid" @click="showImportModal = true">
        批量导入
      </UButton>
      <template v-if="selected.length > 0">
        <UButton icon="i-heroicons-arrow-path" color="blue" variant="soft" @click="openBatchSyncModal">
          批量同步 ({{ selected.length }})
        </UButton>
        <UButton icon="i-heroicons-trash" color="red" variant="soft" @click="batchDelete">
          批量删除 ({{ selected.length }})
        </UButton>
      </template>
    </div>

    <!-- Account table -->
    <div class="w-full overflow-x-hidden">
      <UTable
        v-model="selected"
        :rows="accounts"
        :columns="columns"
        :loading="loading"
        :empty-state="{ icon: 'i-heroicons-user-group', label: '暂无公众号' }"
        :ui="{ td: { padding: 'px-2 py-2' }, th: { padding: 'px-2 py-2' } }"
        by="id"
      >
        <template #index-data="{ index }">
          {{ index + 1 }}
        </template>

        <template #avatar-data="{ row }">
          <img
            v-if="row.avatar"
            :src="row.avatar"
            :alt="row.name"
            referrerpolicy="no-referrer"
            class="w-8 h-8 rounded-full object-cover"
          />
          <div v-else class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs">
            {{ row.name?.charAt(0) }}
          </div>
        </template>

        <template #name-data="{ row }">
          <div class="max-w-[180px]">
            <span class="font-medium truncate block">{{ row.name }}</span>
            <span v-if="row.alias" class="text-xs text-gray-400">({{ row.alias }})</span>
            <UBadge v-if="row.isOverseas" color="orange" size="xs" variant="subtle" class="ml-1">外网</UBadge>
          </div>
        </template>

        <template #lastSyncTime-data="{ row }">
          <span class="text-sm whitespace-nowrap">{{ formatDate(row.lastSyncTime) }}</span>
        </template>

        <template #articleCount-data="{ row }">
          {{ row.articleCount }}
        </template>

        <template #syncStatus-data="{ row }">
          <div class="min-w-[140px]">
            <template v-if="syncTasks.get(row.id)">
              <div class="space-y-1">
                <UProgress
                  v-if="syncTasks.get(row.id)!.status === 'running' && syncTasks.get(row.id)!.total > 0"
                  :value="Math.round((syncTasks.get(row.id)!.synced / syncTasks.get(row.id)!.total) * 100)"
                  size="xs"
                />
                <UProgress
                  v-else-if="syncTasks.get(row.id)!.status === 'running'"
                  :value="undefined"
                  size="xs"
                />
                <p class="text-xs" :class="{
                  'text-blue-500': syncTasks.get(row.id)!.status === 'running',
                  'text-green-500': syncTasks.get(row.id)!.status === 'completed',
                  'text-red-500': syncTasks.get(row.id)!.status === 'failed',
                  'text-yellow-500': syncTasks.get(row.id)!.status === 'stopped',
                }">
                  {{ getSyncStatusText(row.id) }}
                </p>
              </div>
            </template>
            <template v-else>
              <span class="text-xs text-gray-400">{{ row.articleCount > 0 ? `已有 ${row.articleCount} 篇` : '未同步' }}</span>
            </template>
          </div>
        </template>

        <template #actions-data="{ row }">
          <div class="flex items-center gap-1 whitespace-nowrap">
            <template v-if="syncingIds.has(row.id)">
              <UButton icon="i-heroicons-stop" color="yellow" variant="ghost" size="xs" @click="stopSync(row.id)">
                停止
              </UButton>
            </template>
            <template v-else>
              <UButton icon="i-heroicons-arrow-path" color="blue" variant="ghost" size="xs" @click="quickSync(row)">
                同步
              </UButton>
              <UButton icon="i-heroicons-cog-6-tooth" color="gray" variant="ghost" size="xs" @click="openSyncModal(row)" title="同步设置" />
            </template>
            <UButton
              :icon="row.isOverseas ? 'i-heroicons-globe-alt' : 'i-heroicons-globe-americas'"
              :color="row.isOverseas ? 'orange' : 'gray'"
              variant="ghost"
              size="xs"
              :title="row.isOverseas ? '取消外网标记' : '标记为外网来源'"
              @click="toggleOverseas(row)"
            />
            <UButton icon="i-heroicons-trash" color="red" variant="ghost" size="xs" @click="confirmDelete(row)" />
          </div>
        </template>
      </UTable>
    </div>

    <!-- Sync options modal (single + batch) -->
    <UModal v-model="showSyncModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">
            {{ syncIsBatch ? `批量同步设置 (${selected.length} 个公众号)` : `同步设置 - ${syncTarget?.name}` }}
          </h3>
        </template>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1">最大文章数（留空同步最近50篇）</label>
            <UInput v-model.number="syncMaxArticles" type="number" placeholder="默认: 50" :min="1" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">起始日期（只同步该日期之后的文章）</label>
            <UInput v-model="syncSinceDate" type="date" />
          </div>
          <p class="text-xs text-gray-500">
            每次请求间隔 3 秒，防止触发微信反爬机制。每页获取 5 条消息。
          </p>
        </div>
        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton color="gray" variant="ghost" @click="showSyncModal = false">取消</UButton>
            <UButton color="primary" @click="startSync">开始同步</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Delete confirmation modal -->
    <UModal v-model="showDeleteModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">确认删除</h3>
        </template>
        <p>确定要删除公众号 <strong>{{ deleteTarget?.name }}</strong> 吗？</p>
        <p class="text-sm text-gray-500 mt-2">删除后将同时移除该公众号的所有关联文章数据，此操作不可撤销。</p>
        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton color="gray" variant="ghost" @click="showDeleteModal = false">取消</UButton>
            <UButton color="red" :loading="deleting" @click="executeDelete">确认删除</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Add account search modal -->
    <UModal v-model="showAddModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">搜索公众号</h3>
        </template>
        <div class="space-y-4">
          <div class="flex gap-2">
            <UInput v-model="searchKeyword" placeholder="输入公众号名称搜索" class="flex-1" @keyup.enter="searchAccounts" />
            <UButton :loading="searching" @click="searchAccounts">搜索</UButton>
          </div>
          <div v-if="searchResults.length > 0" class="space-y-2 max-h-80 overflow-y-auto">
            <div
              v-for="result in searchResults"
              :key="result.fakeid"
              class="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <img
                v-if="result.avatar"
                :src="result.avatar"
                :alt="result.nickname"
                referrerpolicy="no-referrer"
                class="w-8 h-8 rounded-full object-cover"
              />
              <div v-else class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div class="flex-1 min-w-0">
                <p class="font-medium truncate">{{ result.nickname }}</p>
                <p v-if="result.alias" class="text-xs text-gray-500 truncate">{{ result.alias }}</p>
              </div>
              <UButton size="xs" color="primary" :loading="subscribing === result.fakeid" @click="subscribeAccount(result)">
                添加
              </UButton>
            </div>
          </div>
          <p v-else-if="searchKeyword && !searching" class="text-sm text-gray-500 text-center py-4">
            输入关键词后点击搜索
          </p>
        </div>
      </UCard>
    </UModal>

    <!-- Import modal -->
    <UModal v-model="showImportModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">批量导入公众号</h3>
        </template>
        <div class="space-y-4">
          <p class="text-sm text-gray-500">请选择 JSON 文件，格式为包含 fakeid、nickname、round_head_img 字段的数组。</p>
          <input type="file" accept=".json" class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100" @change="handleFileSelect" />
        </div>
        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton color="gray" variant="ghost" @click="showImportModal = false">取消</UButton>
            <UButton color="primary" :loading="importing" :disabled="!importFile" @click="executeImport">导入</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Login prompt modal -->
    <WechatLoginModal v-model="showLoginPrompt" />
  </div>
</template>
