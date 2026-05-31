<script setup lang="ts">
interface Props {
  source: {
    id: number;
    name: string;
  };
}

const props = defineProps<Props>();
const emit = defineEmits<{ close: [] }>();

interface ScrapedRecord {
  id: number;
  columns: string[];
  rowCount: number;
  scrapedAt: string;
}

interface ScrapedDataFull {
  id: number;
  data: Record<string, any>[];
  columns: string[];
  rowCount: number;
  scrapedAt: string;
}

const { data: records } = await useFetch<ScrapedRecord[]>('/api/scraper/data', {
  query: { sourceId: props.source.id },
});

const selectedRecord = ref<ScrapedDataFull | null>(null);
const loading = ref(false);

async function loadRecord(record: ScrapedRecord) {
  loading.value = true;
  try {
    selectedRecord.value = await $fetch<ScrapedDataFull>(`/api/scraper/data/${record.id}`);
  } finally {
    loading.value = false;
  }
}

// 自动加载最新一条
onMounted(async () => {
  if (records.value?.length) {
    await loadRecord(records.value[0]);
  }
});

function formatTime(t: string) {
  return new Date(t).toLocaleString('zh-CN');
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold">{{ source.name }} - 抓取数据</h3>
        <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" @click="emit('close')" />
      </div>
    </template>

    <div class="space-y-4">
      <!-- 历史记录选择 -->
      <div v-if="records?.length" class="flex items-center gap-2 flex-wrap">
        <span class="text-sm text-gray-500">历史记录:</span>
        <UButton
          v-for="r in records"
          :key="r.id"
          size="xs"
          :color="selectedRecord?.id === r.id ? 'primary' : 'gray'"
          variant="soft"
          @click="loadRecord(r)"
        >
          {{ formatTime(r.scrapedAt) }} ({{ r.rowCount }}行)
        </UButton>
      </div>

      <!-- 数据表格 -->
      <div v-if="selectedRecord" class="overflow-auto max-h-[60vh]">
        <table class="w-full text-sm border-collapse">
          <thead class="sticky top-0 bg-gray-50 dark:bg-gray-700">
            <tr>
              <th
                v-for="col in selectedRecord.columns"
                :key="col"
                class="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300 border-b"
              >
                {{ col }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, idx) in selectedRecord.data"
              :key="idx"
              class="hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <td
                v-for="col in selectedRecord.columns"
                :key="col"
                class="px-3 py-2 border-b border-gray-100 dark:border-gray-700"
              >
                {{ row[col] ?? '-' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 空状态 -->
      <div v-else-if="!loading" class="text-center py-8 text-gray-400">
        <p>暂无抓取数据，请先执行抓取</p>
      </div>

      <div v-if="loading" class="text-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl text-gray-400" />
      </div>
    </div>
  </UCard>
</template>
