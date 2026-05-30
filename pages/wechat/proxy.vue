<script setup lang="ts">
const toast = useToast();

interface ProxyNode {
  id: number;
  url: string;
  name?: string;
  authorization?: string;
  isPublic: boolean;
  enabled: boolean;
}

// Data
const proxies = ref<ProxyNode[]>([]);
const loading = ref(false);
const editingProxy = ref<ProxyNode | null>(null);

// Delete confirmation
const showDeleteModal = ref(false);
const deleteTarget = ref<ProxyNode | null>(null);
const deleting = ref(false);

// Load proxy list
async function loadProxies() {
  loading.value = true;
  try {
    const data = await $fetch<{ list: ProxyNode[] }>('/api/wechat/proxy');
    proxies.value = data.list;
  } catch (error: any) {
    toast.add({ title: '加载失败', description: error?.message || '无法加载代理列表', color: 'red' });
  } finally {
    loading.value = false;
  }
}

// Edit proxy
function handleEdit(proxy: ProxyNode) {
  editingProxy.value = { ...proxy };
}

// After form saved
function handleSaved() {
  editingProxy.value = null;
  loadProxies();
}

// After form cancelled
function handleCancelled() {
  editingProxy.value = null;
}

// Delete proxy
function confirmDelete(proxy: ProxyNode) {
  deleteTarget.value = proxy;
  showDeleteModal.value = true;
}

async function executeDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  try {
    await $fetch(`/api/wechat/proxy/${deleteTarget.value.id}`, { method: 'DELETE' });
    toast.add({ title: '删除成功', description: `已删除代理节点`, color: 'green' });
    showDeleteModal.value = false;
    deleteTarget.value = null;
    await loadProxies();
  } catch (error: any) {
    toast.add({ title: '删除失败', description: error?.message || '删除代理节点失败', color: 'red' });
  } finally {
    deleting.value = false;
  }
}

// Display name for proxy
function getProxyDisplayName(proxy: ProxyNode): string {
  return proxy.name || proxy.url;
}

// Load on mount
onMounted(() => {
  loadProxies();
});
</script>

<template>
  <div class="p-6 space-y-6">
    <h2 class="text-xl font-bold">代理配置</h2>

    <!-- Proxy form -->
    <WechatProxyForm
      :editing-proxy="editingProxy"
      @saved="handleSaved"
      @cancelled="handleCancelled"
    />

    <!-- Proxy list -->
    <div class="space-y-3">
      <h3 class="text-lg font-medium">已配置代理节点</h3>

      <div v-if="loading" class="text-gray-500">
        加载中...
      </div>

      <div v-else-if="proxies.length === 0" class="text-gray-500 py-4">
        暂无代理节点，请通过上方表单添加。
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="proxy in proxies"
          :key="proxy.id"
          class="flex items-center justify-between p-4 rounded-lg border dark:border-gray-700"
        >
          <div class="min-w-0 flex-1">
            <p class="font-medium truncate">{{ getProxyDisplayName(proxy) }}</p>
            <p class="text-sm text-gray-500 truncate">{{ proxy.url }}</p>
          </div>
          <div class="flex items-center gap-2 ml-4 shrink-0">
            <UButton
              icon="i-heroicons-pencil-square"
              color="blue"
              variant="ghost"
              size="xs"
              @click="handleEdit(proxy)"
            >
              编辑
            </UButton>
            <UButton
              icon="i-heroicons-trash"
              color="red"
              variant="ghost"
              size="xs"
              @click="confirmDelete(proxy)"
            >
              删除
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete confirmation modal -->
    <UModal v-model="showDeleteModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">确认删除</h3>
        </template>
        <p>确定要删除代理节点 <strong>{{ deleteTarget?.name || deleteTarget?.url }}</strong> 吗？</p>
        <p class="text-sm text-gray-500 mt-2">此操作不可撤销。</p>
        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton color="gray" variant="ghost" @click="showDeleteModal = false">
              取消
            </UButton>
            <UButton color="red" :loading="deleting" @click="executeDelete">
              确认删除
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
