<script setup lang="ts">
import { useWechatAuth } from '~/composables/useWechatAuth';
import { useWechatDownload } from '~/composables/useWechatDownload';

const {
  isLoggedIn,
  nickname,
  avatar,
  authKey,
  qrCodeUrl,
  loginStatus,
  login,
  logout,
} = useWechatAuth();

const { loading: downloading, progress, total, stats: downloadStats, start: startDownload, stop: stopDownload } = useWechatDownload();

// --- Account Management ---
const searchKeyword = ref('');
const searchLoading = ref(false);
const searchResults = ref<any[]>([]);

const subscribedAccounts = ref<any[]>([]);
const accountsLoading = ref(false);

const selectedAccount = ref<any>(null);
const articles = ref<any[]>([]);
const articlesLoading = ref(false);
const selectAll = ref(false);
const selectedArticleIds = ref<number[]>([]);

const syncLoading = ref<Record<number, boolean>>({});
const importLoading = ref(false);
const importResult = ref('');

// --- Proxy Settings ---
const proxyExpanded = ref(false);
const proxies = ref<any[]>([]);
const proxiesLoading = ref(false);
const proxyForm = ref({ url: '', name: '', authorization: '' });
const editingProxyId = ref<number | null>(null);

// --- Load subscribed accounts ---
async function loadAccounts() {
  accountsLoading.value = true;
  try {
    const data = await $fetch<{ list: any[] }>('/api/wechat/accounts', {
      params: { authKey: authKey.value },
    });
    subscribedAccounts.value = data.list || [];
  } catch (e: any) {
    console.error('Failed to load accounts:', e);
  } finally {
    accountsLoading.value = false;
  }
}

// --- Search accounts ---
async function searchAccounts() {
  if (!searchKeyword.value.trim()) return;
  searchLoading.value = true;
  searchResults.value = [];
  try {
    const data = await $fetch<{ list: any[] }>('/api/wechat/accounts/search', {
      params: { keyword: searchKeyword.value, authKey: authKey.value },
    });
    searchResults.value = data.list || [];
  } catch (e: any) {
    console.error('Search failed:', e);
  } finally {
    searchLoading.value = false;
  }
}

// --- Subscribe to account ---
async function subscribeAccount(account: any) {
  try {
    await $fetch('/api/wechat/accounts/subscribe', {
      method: 'POST',
      body: {
        fakeid: account.fakeid,
        nickname: account.nickname,
        avatar: account.round_head_img || account.avatar,
        alias: account.alias,
        serviceType: account.service_type,
        authKey: authKey.value,
      },
    });
    await loadAccounts();
  } catch (e: any) {
    console.error('Subscribe failed:', e);
  }
}

// --- Delete subscription ---
async function deleteAccount(id: number) {
  try {
    await $fetch(`/api/wechat/accounts/${id}`, {
      method: 'DELETE',
      params: { authKey: authKey.value },
    });
    if (selectedAccount.value?.id === id) {
      selectedAccount.value = null;
      articles.value = [];
    }
    await loadAccounts();
  } catch (e: any) {
    console.error('Delete failed:', e);
  }
}

// --- Sync articles for an account ---
async function syncArticles(account: any) {
  syncLoading.value = { ...syncLoading.value, [account.id]: true };
  try {
    await $fetch('/api/wechat/articles/sync', {
      method: 'POST',
      body: { fakeid: account.fakeid, authKey: authKey.value },
    });
    await loadAccounts();
    if (selectedAccount.value?.id === account.id) {
      await loadArticles(account);
    }
  } catch (e: any) {
    console.error('Sync failed:', e);
  } finally {
    syncLoading.value = { ...syncLoading.value, [account.id]: false };
  }
}

// --- Load articles for selected account ---
async function loadArticles(account: any) {
  selectedAccount.value = account;
  articlesLoading.value = true;
  selectedArticleIds.value = [];
  selectAll.value = false;
  try {
    const data = await $fetch<{ list: any[] }>('/api/wechat/articles/list', {
      params: { sourceId: account.id, authKey: authKey.value },
    });
    articles.value = data.list || [];
  } catch (e: any) {
    console.error('Load articles failed:', e);
  } finally {
    articlesLoading.value = false;
  }
}

// --- Select all toggle ---
function toggleSelectAll() {
  if (selectAll.value) {
    selectedArticleIds.value = articles.value
      .filter((a) => a.downloadStatus !== 'downloaded')
      .map((a) => a.id);
  } else {
    selectedArticleIds.value = [];
  }
}

// --- Download selected articles ---
async function downloadSelected() {
  if (selectedArticleIds.value.length === 0) return;
  await startDownload(selectedArticleIds.value);
  // Reload articles to reflect updated status
  if (selectedAccount.value) {
    await loadArticles(selectedAccount.value);
  }
}

// --- Import accounts from JSON ---
async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  importLoading.value = true;
  importResult.value = '';
  try {
    const text = await file.text();
    const accounts = JSON.parse(text);
    const data = await $fetch<{ total: number; created: number; skipped: number }>('/api/wechat/accounts/import', {
      method: 'POST',
      body: { accounts, authKey: authKey.value },
    });
    importResult.value = `导入完成：新增 ${data.created} 个，跳过 ${data.skipped} 个`;
    await loadAccounts();
  } catch (e: any) {
    importResult.value = `导入失败：${e.data?.message || e.message}`;
  } finally {
    importLoading.value = false;
    input.value = '';
  }
}

// --- Proxy management ---
async function loadProxies() {
  proxiesLoading.value = true;
  try {
    const data = await $fetch<{ list: any[] }>('/api/wechat/proxy');
    proxies.value = data.list || [];
  } catch (e: any) {
    console.error('Load proxies failed:', e);
  } finally {
    proxiesLoading.value = false;
  }
}

async function saveProxy() {
  if (!proxyForm.value.url.trim()) return;
  try {
    if (editingProxyId.value) {
      await $fetch(`/api/wechat/proxy/${editingProxyId.value}`, {
        method: 'PUT',
        body: proxyForm.value,
      });
    } else {
      await $fetch('/api/wechat/proxy', {
        method: 'POST',
        body: proxyForm.value,
      });
    }
    proxyForm.value = { url: '', name: '', authorization: '' };
    editingProxyId.value = null;
    await loadProxies();
  } catch (e: any) {
    console.error('Save proxy failed:', e);
  }
}

function editProxy(proxy: any) {
  editingProxyId.value = proxy.id;
  proxyForm.value = {
    url: proxy.url,
    name: proxy.name || '',
    authorization: proxy.authorization || '',
  };
}

async function deleteProxy(id: number) {
  try {
    await $fetch(`/api/wechat/proxy/${id}`, { method: 'DELETE' });
    await loadProxies();
  } catch (e: any) {
    console.error('Delete proxy failed:', e);
  }
}

function cancelEdit() {
  editingProxyId.value = null;
  proxyForm.value = { url: '', name: '', authorization: '' };
}

// --- Initialize data when logged in ---
watch(isLoggedIn, (loggedIn) => {
  if (loggedIn) {
    loadAccounts();
    loadProxies();
  }
}, { immediate: true });

// --- Helpers ---
function formatDate(dateStr: string | null) {
  if (!dateStr) return '从未同步';
  return new Date(dateStr).toLocaleString('zh-CN');
}

const downloadedCount = computed(() => {
  return progress.value.completed + progress.value.failed + progress.value.deleted;
});
</script>

<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div
      class="relative rounded-xl overflow-hidden py-8 px-6"
      style="background-image: url('/bg/bg2.jpg'); background-size: cover; background-position: center;"
    >
      <div class="absolute inset-0 bg-gradient-to-r from-green-900/80 to-green-800/60" />
      <h1 class="relative z-10 text-2xl font-bold text-white">微信公众号管理</h1>
    </div>

    <!-- Login Section (shown when not logged in) -->
    <UCard v-if="!isLoggedIn">
      <template #header>
        <h3 class="font-semibold">扫码登录</h3>
      </template>

      <div class="flex flex-col items-center space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          扫描微信公众号平台二维码登录，获取访问权限
        </p>

        <!-- QR Code Display -->
        <div v-if="qrCodeUrl" class="border rounded-lg p-4 bg-white">
          <img :src="qrCodeUrl" alt="微信登录二维码" class="w-48 h-48" />
        </div>

        <!-- Status Messages -->
        <div class="text-sm text-center">
          <p v-if="loginStatus === 'scanning' && qrCodeUrl" class="text-blue-600">
            请使用微信扫描二维码...
          </p>
          <p v-else-if="loginStatus === 'scanned'" class="text-green-600">
            已扫码，请在手机上确认登录
          </p>
          <p v-else-if="loginStatus === 'confirmed'" class="text-green-600">
            登录成功！
          </p>
          <p v-else-if="loginStatus === 'expired'" class="text-red-500">
            二维码已过期，请重新获取
          </p>
        </div>

        <!-- Action Buttons -->
        <UButton
          v-if="loginStatus === 'idle' || loginStatus === 'expired'"
          @click="login"
          color="primary"
        >
          {{ loginStatus === 'expired' ? '重新获取二维码' : '获取登录二维码' }}
        </UButton>
      </div>
    </UCard>

    <!-- Logged In Header -->
    <UCard v-if="isLoggedIn">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <img
            v-if="avatar"
            :src="avatar"
            alt="头像"
            class="w-10 h-10 rounded-full"
          />
          <div v-else class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <span class="text-green-700 font-medium">{{ nickname?.charAt(0) || 'W' }}</span>
          </div>
          <div>
            <p class="font-medium">{{ nickname || '已登录' }}</p>
            <p class="text-xs text-gray-500">微信公众号平台已连接</p>
          </div>
        </div>
        <UButton @click="logout" color="gray" variant="ghost" size="sm">
          退出登录
        </UButton>
      </div>
    </UCard>

    <!-- Account Management (shown when logged in) -->
    <template v-if="isLoggedIn">
      <!-- Search & Subscribe -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">公众号搜索与订阅</h3>
            <label class="cursor-pointer">
              <UButton as="span" color="gray" variant="soft" size="sm" :loading="importLoading">
                批量导入
              </UButton>
              <input type="file" accept=".json" class="hidden" @change="handleImport" />
            </label>
          </div>
        </template>

        <!-- Import Result -->
        <p v-if="importResult" class="text-sm mb-4" :class="importResult.includes('失败') ? 'text-red-500' : 'text-green-600'">
          {{ importResult }}
        </p>

        <!-- Search Input -->
        <div class="flex gap-2 mb-4">
          <UInput
            v-model="searchKeyword"
            placeholder="输入公众号名称搜索..."
            class="flex-1"
            @keyup.enter="searchAccounts"
          />
          <UButton @click="searchAccounts" :loading="searchLoading" color="primary">
            搜索
          </UButton>
        </div>

        <!-- Search Results -->
        <div v-if="searchResults.length > 0" class="space-y-2 mb-4">
          <p class="text-xs text-gray-500">搜索结果：</p>
          <div
            v-for="account in searchResults"
            :key="account.fakeid"
            class="flex items-center justify-between p-3 border rounded-lg"
          >
            <div class="flex items-center gap-3">
              <img
                v-if="account.round_head_img"
                :src="account.round_head_img"
                class="w-8 h-8 rounded-full"
              />
              <span class="text-sm font-medium">{{ account.nickname }}</span>
            </div>
            <UButton @click="subscribeAccount(account)" size="xs" color="green">
              订阅
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- Subscribed Accounts List -->
      <UCard>
        <template #header>
          <h3 class="font-semibold">已订阅公众号</h3>
        </template>

        <div v-if="accountsLoading" class="text-center py-4 text-gray-500 text-sm">
          加载中...
        </div>

        <div v-else-if="subscribedAccounts.length === 0" class="text-center py-4 text-gray-500 text-sm">
          暂无订阅的公众号
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="account in subscribedAccounts"
            :key="account.id"
            class="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
            :class="{ 'ring-2 ring-primary-500': selectedAccount?.id === account.id }"
            @click="loadArticles(account)"
          >
            <div class="flex items-center gap-3">
              <img
                v-if="account.avatar"
                :src="account.avatar"
                class="w-9 h-9 rounded-full"
              />
              <div v-else class="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center">
                <span class="text-gray-600 text-xs">{{ account.name?.charAt(0) }}</span>
              </div>
              <div>
                <p class="text-sm font-medium">{{ account.name }}</p>
                <p class="text-xs text-gray-500">
                  {{ account.articleCount || 0 }} 篇文章 · 最后同步：{{ formatDate(account.lastSyncAt) }}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2" @click.stop>
              <UButton
                @click="syncArticles(account)"
                :loading="syncLoading[account.id]"
                size="xs"
                color="blue"
                variant="soft"
              >
                同步
              </UButton>
              <UButton
                @click="deleteAccount(account.id)"
                size="xs"
                color="red"
                variant="ghost"
              >
                删除
              </UButton>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Article List (shown when account selected) -->
      <UCard v-if="selectedAccount">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">{{ selectedAccount.name }} - 文章列表</h3>
            <div class="flex items-center gap-2">
              <UButton
                v-if="!downloading"
                @click="downloadSelected"
                :disabled="selectedArticleIds.length === 0"
                size="sm"
                color="primary"
              >
                下载选中 ({{ selectedArticleIds.length }})
              </UButton>
              <UButton
                v-else
                @click="stopDownload"
                size="sm"
                color="red"
              >
                停止下载
              </UButton>
            </div>
          </div>
        </template>

        <!-- Download Progress -->
        <div v-if="downloading" class="mb-4">
          <div class="flex justify-between text-xs text-gray-500 mb-1">
            <span>下载进度</span>
            <span>{{ downloadedCount }} / {{ total }}</span>
          </div>
          <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
            <div
              class="bg-green-500 h-2.5 rounded-full transition-all duration-300"
              :style="{ width: `${total > 0 ? (downloadedCount / total) * 100 : 0}%` }"
            />
          </div>
          <div class="flex gap-4 mt-1 text-xs text-gray-500">
            <span class="text-green-600">成功: {{ progress.completed }}</span>
            <span class="text-red-500">失败: {{ progress.failed }}</span>
            <span class="text-orange-500">已删除: {{ progress.deleted }}</span>
          </div>
        </div>

        <!-- Download Stats (after completion) -->
        <div v-if="downloadStats && !downloading" class="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
          <p class="font-medium mb-1">下载完成</p>
          <div class="flex gap-4 text-xs">
            <span class="text-green-600">成功: {{ downloadStats.completed }}</span>
            <span class="text-red-500">失败: {{ downloadStats.failed }}</span>
            <span class="text-orange-500">已删除: {{ downloadStats.deleted }}</span>
            <span>总计: {{ downloadStats.total }}</span>
          </div>
        </div>

        <!-- Select All -->
        <div class="flex items-center gap-2 mb-3 pb-3 border-b">
          <input
            type="checkbox"
            v-model="selectAll"
            @change="toggleSelectAll"
            class="rounded"
          />
          <span class="text-sm text-gray-600 dark:text-gray-400">全选未下载文章</span>
        </div>

        <!-- Articles Loading -->
        <div v-if="articlesLoading" class="text-center py-4 text-gray-500 text-sm">
          加载中...
        </div>

        <!-- Articles List -->
        <div v-else-if="articles.length === 0" class="text-center py-4 text-gray-500 text-sm">
          暂无文章，请先同步
        </div>

        <div v-else class="space-y-2 max-h-96 overflow-y-auto">
          <div
            v-for="article in articles"
            :key="article.id"
            class="flex items-center gap-3 p-2 border rounded hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <input
              type="checkbox"
              :value="article.id"
              v-model="selectedArticleIds"
              :disabled="article.downloadStatus === 'downloaded'"
              class="rounded"
            />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">{{ article.title }}</p>
              <p class="text-xs text-gray-500">
                {{ article.authorName || '未知作者' }} · {{ formatDate(article.publishedAt) }}
              </p>
            </div>
            <span
              class="text-xs px-2 py-0.5 rounded-full whitespace-nowrap"
              :class="{
                'bg-green-100 text-green-700': article.downloadStatus === 'downloaded',
                'bg-gray-100 text-gray-600': article.downloadStatus === 'pending',
                'bg-red-100 text-red-700': article.downloadStatus === 'failed',
                'bg-orange-100 text-orange-700': article.downloadStatus === 'deleted',
              }"
            >
              {{ article.downloadStatus === 'downloaded' ? '已下载' :
                 article.downloadStatus === 'failed' ? '失败' :
                 article.downloadStatus === 'deleted' ? '已删除' : '待下载' }}
            </span>
          </div>
        </div>
      </UCard>

      <!-- Proxy Settings (Collapsible) -->
      <UCard>
        <template #header>
          <div
            class="flex items-center justify-between cursor-pointer"
            @click="proxyExpanded = !proxyExpanded"
          >
            <h3 class="font-semibold">代理节点配置</h3>
            <UButton
              :icon="proxyExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
              color="gray"
              variant="ghost"
              size="xs"
            />
          </div>
        </template>

        <div v-show="proxyExpanded" class="space-y-4">
          <!-- Add/Edit Proxy Form -->
          <div class="flex flex-col gap-2 p-3 border rounded-lg bg-gray-50 dark:bg-gray-800">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
              <UInput v-model="proxyForm.url" placeholder="代理 URL" />
              <UInput v-model="proxyForm.name" placeholder="名称（可选）" />
              <UInput v-model="proxyForm.authorization" placeholder="Authorization（可选）" />
            </div>
            <div class="flex gap-2">
              <UButton @click="saveProxy" size="sm" color="primary">
                {{ editingProxyId ? '更新' : '添加' }}
              </UButton>
              <UButton v-if="editingProxyId" @click="cancelEdit" size="sm" color="gray" variant="ghost">
                取消
              </UButton>
            </div>
          </div>

          <!-- Proxy List -->
          <div v-if="proxiesLoading" class="text-center py-2 text-gray-500 text-sm">
            加载中...
          </div>

          <div v-else-if="proxies.length === 0" class="text-center py-2 text-gray-500 text-sm">
            暂无代理节点
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="proxy in proxies"
              :key="proxy.id"
              class="flex items-center justify-between p-3 border rounded-lg"
            >
              <div>
                <p class="text-sm font-medium">
                  {{ proxy.name || proxy.url }}
                  <span v-if="proxy.isPublic" class="text-xs text-blue-500 ml-1">[公共]</span>
                </p>
                <p class="text-xs text-gray-500 truncate max-w-md">{{ proxy.url }}</p>
              </div>
              <div class="flex items-center gap-2">
                <UButton @click="editProxy(proxy)" size="xs" color="gray" variant="soft">
                  编辑
                </UButton>
                <UButton @click="deleteProxy(proxy.id)" size="xs" color="red" variant="ghost">
                  删除
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>
