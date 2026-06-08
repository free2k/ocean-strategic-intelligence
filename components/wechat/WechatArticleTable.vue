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
const selectedAccountIds = ref<number[]>([]);

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

// Account options for selector
const accountOptions = computed(() => accounts.value.map(a => ({ id: a.id, name: a.name })));

// Popover 搜索
const accountSearch = ref('');
const filteredAccounts = computed(() => {
  const keyword = accountSearch.value.trim().toLowerCase();
  if (!keyword) return accounts.value;
  return accounts.value.filter(a => a.name.toLowerCase().includes(keyword));
});

// 切换公众号选中状态
function toggleAccount(id: number) {
  const idx = selectedAccountIds.value.indexOf(id);
  if (idx === -1) {
    selectedAccountIds.value = [...selectedAccountIds.value, id];
  } else {
    selectedAccountIds.value = selectedAccountIds.value.filter(x => x !== id);
  }
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
    if (selectedAccountIds.value.length > 0) {
      params.sourceId = selectedAccountIds.value.join(',');
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

    // 选中公众号后自动全选文章列表
    if (selectedAccountIds.value.length > 0) {
      selected.value = [...data.list];
    } else {
      // 不选公众号时默认勾选已下载的
      selected.value = data.list.filter(a => a.downloadStatus === 'downloaded');
    }
  } catch (error: any) {
    toast.add({ title: '加载失败', description: error?.message || '无法加载文章列表', color: 'red' });
  } finally {
    loadingArticles.value = false;
  }
}

// Watch filters
watch([selectedAccountIds, startDate, endDate], () => {
  currentPage.value = 1;
  loadArticles();
});

// Page change
function changePage(page: number) {
  currentPage.value = page;
  loadArticles();
}

// Download progress
const completedCount = computed(() => progress.value.completed + progress.value.failed + progress.value.deleted);

// Pending count in selection
const pendingCount = computed(() => selected.value.filter(a => a.downloadStatus !== 'downloaded').length);

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

// Download all articles (all accounts, filtered by date)
async function downloadAll() {
  if (!requireLogin()) return;

  // 查询所有符合日期条件的未下载文章
  try {
    const params: Record<string, any> = { page: 1, pageSize: 500 };
    if (startDate.value) params.startDate = startDate.value;
    if (endDate.value) params.endDate = endDate.value;

    const data = await $fetch<{ list: Article[]; total: number }>('/api/wechat/articles/list', { params });
    const pendingArticles = data.list.filter(a => a.downloadStatus !== 'downloaded');

    if (pendingArticles.length === 0) {
      toast.add({ title: '无需下载', description: '所有文章都已下载', color: 'yellow' });
      return;
    }

    toast.add({ title: '开始下载全部', description: `共 ${pendingArticles.length} 篇待下载`, color: 'blue' });
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

onMounted(() => {
  loadAccounts();
  loadArticles();
});
</script>

<template>
  <div class="space-y-4 overflow-hidden">
    <!-- Top filter bar -->
    <div class="flex items-center gap-3 flex-wrap">
      <!-- 公众号选择器 Popover -->
      <UPopover :popper="{ placement: 'bottom-start' }">
        <UButton color="gray" variant="solid" trailing-icon="i-heroicons-chevron-down-20-solid">
          <span v-if="selectedAccountIds.length === 0">全部公众号</span>
          <span v-else>已选 {{ selectedAccountIds.length }} 个公众号</span>
        </UButton>

        <template #panel>
          <div class="w-64 p-3">
            <!-- 搜索框 -->
            <UInput
              v-model="accountSearch"
              icon="i-heroicons-magnifying-glass"
              placeholder="搜索公众号..."
              size="sm"
              class="mb-2"
            />

            <!-- 全选/清空 -->
            <div class="flex items-center justify-between mb-2 px-1">
              <button class="text-xs text-primary-500 hover:text-primary-600" @click="selectedAccountIds = filteredAccounts.map(a => a.id)">全选</button>
              <button class="text-xs text-gray-400 hover:text-gray-600" @click="selectedAccountIds = []">清空</button>
            </div>

            <!-- 公众号列表 -->
            <div class="max-h-60 overflow-y-auto space-y-1">
              <label
                v-for="account in filteredAccounts"
                :key="account.id"
                class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
              >
                <input
                  type="checkbox"
                  :checked="selectedAccountIds.includes(account.id)"
                  class="rounded border-gray-300 dark:border-gray-600 text-primary-500"
                  @change="toggleAccount(account.id)"
                />
                <span class="text-sm text-gray-700 dark:text-gray-200 truncate">{{ account.name }}</span>
              </label>
              <p v-if="filteredAccounts.length === 0" class="text-xs text-gray-400 text-center py-3">无匹配结果</p>
            </div>
          </div>
        </template>
      </UPopover>

      <UInput v-model="startDate" type="date" class="w-36" />
      <span class="text-gray-400 text-sm">至</span>
      <UInput v-model="endDate" type="date" class="w-36" />

      <!-- 下载全部公众号：仅在未选中公众号时显示 -->
      <UButton
        v-if="selectedAccountIds.length === 0 && !downloading"
        icon="i-heroicons-arrow-down-tray"
        color="blue"
        variant="soft"
        @click="downloadAll"
      >
        下载全部公众号
      </UButton>

      <!-- 下载原文：选中公众号后显示 -->
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
    </div>

    <!-- Download progress bar -->
    <div v-if="downloading" class="flex items-center gap-3">
      <UProgress :value="total > 0 ? Math.round(completedCount / total * 100) : 0" size="sm" class="flex-1" />
      <span class="text-sm text-gray-500 whitespace-nowrap">{{ completedCount }}/{{ total }}</span>
      <UButton icon="i-heroicons-stop" color="red" variant="soft" size="xs" @click="stop">停止</UButton>
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

    <!-- Login prompt modal -->
    <WechatLoginModal v-model="showLoginPrompt" />
  </div>
</template>
