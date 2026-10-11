<script setup lang="ts">
/**
 * 从已抓取的数据源中选择数据，用于图表可视化
 */
interface ScraperSource {
  id: number;
  name: string;
  lastScrapedAt: string | null;
  lastStatus: string;
}

interface ScrapedDataFull {
  id: number;
  data: Record<string, any>[];
  columns: string[];
  rowCount: number;
  scrapedAt: string;
}

const emit = defineEmits<{
  select: [data: { data: Record<string, any>[]; columns: string[]; totalRows: number; preview: Record<string, any>[] }];
}>();

const { data: sources } = await useFetch<ScraperSource[]>('/api/scraper/sources');
const loading = ref(false);

const availableSources = computed(() =>
  sources.value?.filter(s => s.lastStatus === 'success') || []
);

async function loadSourceData(source: ScraperSource) {
  loading.value = true;
  try {
    const result = await $fetch<ScrapedDataFull>('/api/scraper/data', {
      query: { sourceId: source.id, latest: 'true' },
    });
    if (result && result.data?.length) {
      emit('select', {
        data: result.data,
        columns: result.columns,
        totalRows: result.rowCount,
        preview: result.data.slice(0, 5),
      });
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="space-y-2">
    <p class="text-xs text-gray-500">或从已抓取的数据源导入：</p>
    <div v-if="availableSources.length" class="flex flex-wrap gap-2">
      <UButton
        v-for="source in availableSources"
        :key="source.id"
        size="xs"
        color="gray"
        variant="soft"
        :loading="loading"
        @click="loadSourceData(source)"
      >
        <UIcon name="i-heroicons-globe-alt" class="mr-1" />
        {{ source.name }}
      </UButton>
    </div>
    <p v-else class="text-xs text-gray-400">
      暂无可用数据源，请先在「数据抓取」页面配置
    </p>
  </div>
</template>
