<script setup lang="ts">
const toast = useToast();
const router = useRouter();

interface ChannelInfo {
  channel: string;
  count: number;
  lastScrapedAt: string | null;
}

const { data: dbChannels, refresh } = await useFetch<ChannelInfo[]>('/api/scraper/channels');

// 本地保存的空渠道（还没有数据源的）
const localChannels = ref<string[]>([]);

onMounted(() => {
  const stored = localStorage.getItem('scraper-channels');
  if (stored) {
    try { localChannels.value = JSON.parse(stored); } catch {}
  }
});

// 合并数据库渠道和本地空渠道
const channels = computed<ChannelInfo[]>(() => {
  const dbList = dbChannels.value || [];
  const dbNames = new Set(dbList.map(c => c.channel));
  const extras = localChannels.value
    .filter(name => !dbNames.has(name))
    .map(name => ({ channel: name, count: 0, lastScrapedAt: null }));
  return [...dbList, ...extras];
});

function saveLocalChannels() {
  localStorage.setItem('scraper-channels', JSON.stringify(localChannels.value));
}

// 当渠道在数据库中已存在时，从本地列表中清除（同步）
watch(dbChannels, () => {
  if (!dbChannels.value) return;
  const dbNames = new Set(dbChannels.value.map(c => c.channel));
  const before = localChannels.value.length;
  localChannels.value = localChannels.value.filter(name => !dbNames.has(name));
  if (localChannels.value.length !== before) saveLocalChannels();
});

// 渠道卡片颜色
const channelColors = [
  { bg: 'bg-[#001f5b]', hover: 'hover:bg-[#002d7a]', text: 'text-white' },
  { bg: 'bg-yellow-400', hover: 'hover:bg-yellow-500', text: 'text-blue-800' },
  { bg: 'bg-[#f8a4a4]', hover: 'hover:bg-[#f08080]', text: 'text-gray-900' },
  { bg: 'bg-purple-700', hover: 'hover:bg-purple-800', text: 'text-white' },
  { bg: 'bg-blue-600', hover: 'hover:bg-blue-700', text: 'text-white' },
  { bg: 'bg-green-600', hover: 'hover:bg-green-700', text: 'text-white' },
  { bg: 'bg-orange-600', hover: 'hover:bg-orange-700', text: 'text-white' },
  { bg: 'bg-teal-600', hover: 'hover:bg-teal-700', text: 'text-white' },
];

function getColor(index: number) {
  return channelColors[index % channelColors.length];
}

function goToChannel(channel: string) {
  router.push(`/scraper/channel/${encodeURIComponent(channel)}`);
}

// 新增渠道
const showAddModal = ref(false);
const newChannel = ref('');

function addChannel() {
  if (!newChannel.value.trim()) {
    toast.add({ title: '请填写渠道名称', color: 'yellow' });
    return;
  }
  const name = newChannel.value.trim();
  if (channels.value.some(c => c.channel === name)) {
    toast.add({ title: '该渠道已存在', color: 'yellow' });
    return;
  }
  localChannels.value.push(name);
  saveLocalChannels();
  showAddModal.value = false;
  newChannel.value = '';
  toast.add({ title: `已添加渠道「${name}」`, color: 'green' });
}

// 删除空渠道（仅本地的可删除）
function removeChannel(channel: string) {
  localChannels.value = localChannels.value.filter(c => c !== channel);
  saveLocalChannels();
}
</script>

<template>
  <div class="space-y-6">
    <!-- 页头 -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">数据抓取 & 上传</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">选择渠道进入，管理该渠道下的数据采集任务</p>
      </div>
      <UButton icon="i-heroicons-plus" @click="showAddModal = true">添加渠道</UButton>
    </div>

    <!-- 渠道列表 -->
    <div class="space-y-3" v-if="channels.length">
      <div
        v-for="(ch, index) in channels"
        :key="ch.channel"
        class="group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200 transform hover:scale-[1.005] hover:shadow-lg"
        :class="[getColor(index).bg, getColor(index).hover]"
        @click="goToChannel(ch.channel)"
      >
        <div class="flex items-center justify-between px-6 py-5">
          <div class="flex items-center gap-4">
            <h3 class="text-lg font-bold" :class="getColor(index).text">
              {{ ch.channel }}
            </h3>
            <span class="text-sm opacity-70" :class="getColor(index).text">
              {{ ch.count > 0 ? `${ch.count} 个数据源` : '暂无数据源' }}
            </span>
          </div>
          <div class="flex items-center gap-3">
            <span v-if="ch.lastScrapedAt" class="text-xs opacity-60 hidden sm:inline" :class="getColor(index).text">
              最近抓取: {{ new Date(ch.lastScrapedAt).toLocaleDateString('zh-CN') }}
            </span>
            <!-- 删除空渠道按钮 -->
            <UButton
              v-if="ch.count === 0 && localChannels.includes(ch.channel)"
              icon="i-heroicons-x-mark"
              color="white"
              variant="ghost"
              size="xs"
              class="opacity-0 group-hover:opacity-100 transition-opacity"
              title="删除空渠道"
              @click.stop="removeChannel(ch.channel)"
            />
            <UIcon
              name="i-heroicons-chevron-right"
              class="text-lg opacity-60 group-hover:opacity-100 transition-opacity"
              :class="getColor(index).text"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="text-center py-16 text-gray-400 dark:text-gray-500">
      <UIcon name="i-heroicons-globe-alt" class="text-5xl mb-4" />
      <p class="text-lg">暂无数据渠道</p>
      <p class="text-sm mt-1">点击上方按钮添加第一个数据采集渠道（如：国家统计局、海关总署）</p>
    </div>

    <!-- 添加渠道弹窗 -->
    <UModal v-model="showAddModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">添加渠道</h3>
        </template>
        <div class="space-y-4">
          <UFormGroup label="渠道名称">
            <UInput v-model="newChannel" placeholder="例如：国家统计局、海关总署、IEA" @keydown.enter="addChannel" />
          </UFormGroup>
          <p class="text-xs text-gray-500">创建后可在渠道内添加多个数据采集任务</p>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="showAddModal = false">取消</UButton>
            <UButton :disabled="!newChannel.trim()" @click="addChannel">确认</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
