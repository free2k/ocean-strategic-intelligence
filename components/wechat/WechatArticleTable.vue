<script setup lang="ts">
const toast = useToast();
const { authKey, isLoggedIn } = useWechatAuth();
const { loading: downloading, progress, total, start, stop } = useWechatDownload();

// Login prompt
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
  name: string;
  fakeid: string | null;
  avatar: string | null;
}

interface Article {
  id: number;
  title: string;
  link: string;
  sourceId: number | null;
  publishedAt: string;
  downloadStatus: 'pending' | 'downloaded' | 'deleted' | 'failed';
}

// Accounts data
const accounts = ref<Account[]>([]);
const selectedAccountId = ref<number | null>(null);

// Date range filters
const startDate = ref('');
const endDate = ref('');

// Articles data
const articles = ref<Article[]>([]);
const loadingArticles = ref(false);
const currentPage = ref(1);
const pageSize = 20;
const totalArticles = ref(0);

// Row selection
const selected = ref<Article[]>([]);

// Delete state
const showDeleteModal = ref(false);
const deleting = ref(false);

// Batch sync modal
const showBatchSyncModal = ref(false);
const batchSyncAccountId = ref<number | null>(null);
const batchSyncMaxArticles = ref<number | undefined>(50);
const batchSyncSinceDate = ref('');
const batchSyncAll = ref(false);
const batchSyncing = ref(false);

// Account name lookup
const accountNameMap = computed(() => {
  const map: Record<number, string> = {};
  accounts.value.forEach((a) => { map[a.id] = a.name; });
  return map;
});

function getAccountName(sourceId: number | null): string {
  if (!sourceId) return '-';
  return accountNameMap.value[sourceId] || '-';
}

// Table columns
const columns = [
  { key: 'index', label: '序号' },
  { key: 'title', label: '标题' },
  { key: 'source', label: '公众号来源' },
  { key: 'publishedAt', label: '发布时间', sortable: true },
];

// Total pages
const totalPages = computed(() => Math.ceil(totalArticles.value / pageSize));

// Format date
function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Load accounts
async function loadAccounts() {
  try {
    const data = await $fetch<{ list: Account[] }>('/api/wechat/accounts');
    accounts.value = data.list;
  } catch (error: any) {
    toast.add({ title: '加载失败', description: error?.message || '无法加载公众号列表', color: 'red' });
  }
}

// Load articles
async function loadArticles() {
  loadingArticles.value = true;
  try {
    const params: Record<string, any> = {
      page: currentPage.value,
      pageSize,
    };
    if (selectedAccountId.value) {
      params.sourceId = String(selectedAccountId.value);
    }
    if (startDate.value) params.startDate = startDate.value;
    if (endDate.value) params.endDate = endDate.value;

    const data = await $fetch<{ list: Article[]; total: number; page: number; pageSize: number }>(
      '/api/wechat/articles/list',
      { params },
    );
    articles.value = data.list;
    totalArticles.value = data.total;
    currentPage.value = data.page;

    // Auto-select articles that are already downloaded
    selected.value = data.list.filter(a => a.downloadStatus === 'downloaded');
  } catch (error: any) {
    toast.add({ title: '加载失败', description: error?.message || '无法加载文章列表', color: 'red' });
  } finally {
    loadingArticles.value = false;
  }
}

// Watch filters
watch([selectedAccountId, startDate, endDate], () => {
  currentPage.value = 1;
  loadArticles();
});

// Page change
function changePage(page: number) {
  currentPage.value = page;
  loadArticles();
}

// Batch download selected pending articles
async function batchDownload() {
  if (!requireLogin()) return;
  const pendingArticles = selected.value.filter(a => a.downloadStatus !== 'downloaded');
  if (pendingArticles.length === 0) {
    toast.add({ title: '无需下载', description: '选中的文章都已下载', color: 'yellow' });
    return;
  }
  toast.add({ title: '开始下载原文', description: `共 ${pendingArticles.length} 篇待下载`, color: 'blue' });
  try {
    await start(pendingArticles.map(a => a.id));
    toast.add({
      title: '下载完成',
      description: `成功 ${progress.value.completed} 篇，失败 ${progress.value.failed} 篇，已删除 ${progress.value.deleted} 篇`,
      color: progress.value.failed > 0 ? 'yellow' : 'green',
    });
  } catch (error: any) {
    toast.add({ title: '下载失败', description: error?.message || '下载过程中发生错误', color: 'red' });
  }
  await loadArticles();
}

// Delete selected articles
function confirmDelete() {
  if (selected.value.length === 0) return;
  showDeleteModal.value = true;
}

async function executeDelete() {
  deleting.value = true;
  try {
    const ids = selected.value.map(a => a.id);
    await $fetch('/api/wechat/articles/delete', {
      method: 'POST',
      body: { articleIds: ids },
    });
    toast.add({ title: '删除成功', description: `已删除 ${ids.length} 篇文章`, color: 'green' });
    showDeleteModal.value = false;
    selected.value = [];
    await loadArticles();
  } catch (error: any) {
    toast.add({ title: '删除失败', description: error?.message || '删除文章失败', color: 'red' });
  } finally {
    deleting.value = false;
  }
}

// Open batch sync modal
function openBatchSyncModal() {
  if (!requireLogin()) return;
  batchSyncAccountId.value = null;
  batchSyncMaxArticles.value = 50;
  batchSyncSinceDate.value = '';
  batchSyncAll.value = false;
  showBatchSyncModal.value = true;
}

// Execute batch sync
async function executeBatchSync() {
  batchSyncing.value = true;
  try {
    let targetAccounts: Account[] = [];
    if (batchSyncAccountId.value) {
      const found = accounts.value.find(a => a.id === batchSyncAccountId.value);
      if (found) targetAccounts = [found];
    } else {
      targetAccounts = accounts.value;
    }

    for (const account of targetAccounts) {
      if (!account.fakeid) continue;
      const body: any = { fakeid: account.fakeid };
      if (!batchSyncAll.value && batchSyncMaxArticles.value && batchSyncMaxArticles.value > 0) {
        body.maxArticles = batchSyncMaxArticles.value;
      }
      if (batchSyncSinceDate.value) {
        body.sinceDate = new Date(batchSyncSinceDate.value).toISOString();
      }

      try {
        await $fetch('/api/wechat/articles/sync', {
          method: 'POST',
          body,
          headers: authKey.value ? { 'X-Auth-Key': authKey.value } : undefined,
        });
      } catch (err: any) {
        toast.add({ title: `${account.name} 同步失败`, description: err?.data?.message || err?.message, color: 'red' });
      }
    }

    toast.add({ title: '批量抓取已启动', description: `${targetAccounts.length} 个公众号开始同步`, color: 'blue' });
    showBatchSyncModal.value = false;
  } catch (error: any) {
    toast.add({ title: '批量抓取失败', description: error?.message, color: 'red' });
  } finally {
    batchSyncing.value = false;
  }
}

// Download progress
const completedCount = computed(() => progress.value.completed + progress.value.failed + progress.value.deleted);

// Pending count in selection
const pendingCount = computed(() => selected.value.filter(a => a.downloadStatus !== 'downloaded').length);

// Account options for selector
const accountOptions = computed(() => [
  { id: null, name: '全部公众号' },
  ...accounts.value,
]);

onMounted(() => {
  loadAccounts();
  loadArticles();
});
</script>

<template>
  <div class="space-y-4 overflow-hidden">
    <!-- Top filter bar -->
    <div class="flex items-center gap-3 flex-wrap">
      <USelectMenu
        v-model="selectedAccountId"
        :options="accountOptions"
        option-attribute="name"
        value-attribute="id"
        placeholder="全部公众号"
        class="w-48"
      />

      <UInput v-model="startDate" type="date" class="w-36" />
      <span class="text-gray-400 text-sm">至</span>
      <UInput v-model="endDate" type="date" class="w-36" />

      <!-- Batch sync button -->
      <UButton icon="i-heroicons-arrow-path" color="blue" variant="soft" @click="openBatchSyncModal">
        批量抓取
      </UButton>

      <!-- Download selected pending articles -->
      <UButton
        v-if="pendingCount > 0 && !downloading"
        icon="i-heroicons-arrow-down-tray"
        color="primary"
        @click="batchDownload"
      >
        下载原文 ({{ pendingCount }})
      </UButton>

      <!-- Delete selected -->
      <UButton
        v-if="selected.length > 0 && !downloading"
        icon="i-heroicons-trash"
        color="red"
        variant="soft"
        @click="confirmDelete"
      >
        删除 ({{ selected.length }})
      </UButton>

      <!-- Download progress -->
      <div v-if="downloading" class="flex items-center gap-3 flex-1 min-w-[200px]">
        <UProgress :value="total > 0 ? Math.round(completedCount / total * 100) : 0" size="sm" class="flex-1" />
        <span class="text-sm text-gray-500 whitespace-nowrap">{{ completedCount }}/{{ total }}</span>
        <UButton icon="i-heroicons-stop" color="red" variant="soft" size="xs" @click="stop">停止</UButton>
      </div>
    </div>

    <!-- Article table -->
    <div class="w-full">
      <UTable
        v-model="selected"
        :rows="articles"
        :columns="columns"
        :loading="loadingArticles"
        :empty-state="{ icon: 'i-heroicons-document-text', label: '暂无文章数据' }"
        :ui="{ td: { padding: 'px-3 py-2' }, th: { padding: 'px-3 py-2' } }"
        by="id"
      >
        <template #index-data="{ index }">
          {{ (currentPage - 1) * pageSize + index + 1 }}
        </template>

        <template #title-data="{ row }">
          <div class="flex items-center gap-2 max-w-[500px]">
            <UBadge
              v-if="row.downloadStatus === 'downloaded'"
              color="green"
              variant="subtle"
              size="xs"
              class="shrink-0"
            >
              已抓取
            </UBadge>
            <a
              :href="row.link"
              target="_blank"
              rel="noopener"
              class="text-primary-500 hover:underline truncate"
              :title="row.title"
            >
              {{ row.title }}
            </a>
          </div>
        </template>

        <template #source-data="{ row }">
          <span class="text-sm text-gray-500 whitespace-nowrap">{{ getAccountName(row.sourceId) }}</span>
        </template>

        <template #publishedAt-data="{ row }">
          <span class="text-sm whitespace-nowrap">{{ formatDate(row.publishedAt) }}</span>
        </template>
      </UTable>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-between pt-2">
      <span class="text-sm text-gray-500">共 {{ totalArticles }} 篇文章</span>
      <UPagination
        v-model="currentPage"
        :page-count="pageSize"
        :total="totalArticles"
        @update:model-value="changePage"
      />
    </div>

    <!-- Delete confirmation modal -->
    <UModal v-model="showDeleteModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">确认删除</h3>
        </template>
        <p>确定要删除选中的 <strong>{{ selected.length }}</strong> 篇文章吗？</p>
        <p class="text-sm text-gray-500 mt-2">删除后文章数据将无法恢复。</p>
        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton color="gray" variant="ghost" @click="showDeleteModal = false">取消</UButton>
            <UButton color="red" :loading="deleting" @click="executeDelete">确认删除</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Batch sync modal -->
    <UModal v-model="showBatchSyncModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">批量抓取文章</h3>
        </template>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1">选择公众号（留空抓取全部）</label>
            <USelectMenu
              v-model="batchSyncAccountId"
              :options="accountOptions"
              option-attribute="name"
              value-attribute="id"
              placeholder="全部公众号"
              searchable
              searchable-placeholder="搜索..."
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">抓取数量</label>
            <div class="flex items-center gap-3">
              <UInput
                v-model.number="batchSyncMaxArticles"
                type="number"
                placeholder="默认: 50"
                :min="1"
                :disabled="batchSyncAll"
                class="flex-1"
              />
              <UCheckbox v-model="batchSyncAll" label="全部" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">起始日期（只抓取该日期之后的文章）</label>
            <UInput v-model="batchSyncSinceDate" type="date" />
          </div>
          <p class="text-xs text-gray-500">
            每次请求间隔 3 秒，防止触发微信反爬机制。
          </p>
        </div>
        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton color="gray" variant="ghost" @click="showBatchSyncModal = false">取消</UButton>
            <UButton color="primary" :loading="batchSyncing" @click="executeBatchSync">开始抓取</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Login prompt modal -->
    <WechatLoginModal v-model="showLoginPrompt" />
  </div>
</template>
