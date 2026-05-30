<script setup lang="ts">
interface Account {
  id: number;
  name: string;
  avatar: string | null;
}

const props = defineProps<{
  modelValue: number[];
  accounts: Account[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: number[]];
}>();

const selected = computed({
  get: () => props.accounts.filter((a) => props.modelValue.includes(a.id)),
  set: (val: Account[]) => emit('update:modelValue', val.map((a) => a.id)),
});
</script>

<template>
  <USelectMenu
    v-model="selected"
    :options="accounts"
    option-attribute="name"
    multiple
    searchable
    searchable-placeholder="搜索公众号..."
    placeholder="选择公众号"
    class="w-64"
  >
    <template #label>
      <div v-if="selected.length === 1" class="flex items-center gap-2">
        <img
          v-if="selected[0].avatar"
          :src="selected[0].avatar"
          :alt="selected[0].name"
          referrerpolicy="no-referrer"
          class="w-5 h-5 rounded-full object-cover"
        />
        <span>{{ selected[0].name }}</span>
      </div>
      <span v-else-if="selected.length > 1" class="text-gray-700 dark:text-gray-200">
        已选 {{ selected.length }} 个公众号
      </span>
      <span v-else class="text-gray-400">选择公众号</span>
    </template>

    <template #option="{ option }">
      <div class="flex items-center gap-2">
        <img
          v-if="option.avatar"
          :src="option.avatar"
          :alt="option.name"
          referrerpolicy="no-referrer"
          class="w-5 h-5 rounded-full object-cover"
        />
        <div v-else class="w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-[10px]">
          {{ option.name?.charAt(0) }}
        </div>
        <span>{{ option.name }}</span>
      </div>
    </template>
  </USelectMenu>
</template>
