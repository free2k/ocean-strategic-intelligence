<script setup lang="ts">
interface ProxyNode {
  id: number;
  url: string;
  name?: string;
  authorization?: string;
  isPublic: boolean;
}

interface Props {
  editingProxy?: ProxyNode | null;
}

const props = withDefaults(defineProps<Props>(), {
  editingProxy: null,
});

const emit = defineEmits<{
  saved: [];
  cancelled: [];
}>();

const toast = useToast();

// Form data
const form = reactive({
  url: '',
  name: '',
  authorization: '',
});

const submitting = ref(false);

// Whether in edit mode
const isEditing = computed(() => !!props.editingProxy);

// Watch editingProxy to populate form
watch(
  () => props.editingProxy,
  (proxy) => {
    if (proxy) {
      form.url = proxy.url;
      form.name = proxy.name || '';
      form.authorization = proxy.authorization || '';
    } else {
      resetForm();
    }
  },
  { immediate: true },
);

function resetForm() {
  form.url = '';
  form.name = '';
  form.authorization = '';
}

async function handleSubmit() {
  if (!form.url.trim()) {
    toast.add({ title: '验证失败', description: '代理节点 URL 不能为空', color: 'red' });
    return;
  }

  submitting.value = true;
  try {
    if (isEditing.value && props.editingProxy) {
      await $fetch(`/api/wechat/proxy/${props.editingProxy.id}`, {
        method: 'PUT',
        body: {
          url: form.url.trim(),
          name: form.name.trim() || undefined,
          authorization: form.authorization.trim() || undefined,
        },
      });
      toast.add({ title: '更新成功', description: '代理节点已更新', color: 'green' });
    } else {
      await $fetch('/api/wechat/proxy', {
        method: 'POST',
        body: {
          url: form.url.trim(),
          name: form.name.trim() || undefined,
          authorization: form.authorization.trim() || undefined,
        },
      });
      toast.add({ title: '添加成功', description: '代理节点已添加', color: 'green' });
    }
    resetForm();
    emit('saved');
  } catch (error: any) {
    toast.add({ title: '操作失败', description: error?.message || '保存代理节点失败', color: 'red' });
  } finally {
    submitting.value = false;
  }
}

function handleCancel() {
  resetForm();
  emit('cancelled');
}
</script>

<template>
  <UCard>
    <template #header>
      <h3 class="text-lg font-semibold">{{ isEditing ? '编辑代理节点' : '添加代理节点' }}</h3>
    </template>

    <form class="space-y-4" @submit.prevent="handleSubmit">
      <div>
        <label class="block text-sm font-medium mb-1">URL <span class="text-red-500">*</span></label>
        <UInput
          v-model="form.url"
          placeholder="https://example.com/proxy"
          required
        />
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">名称</label>
        <UInput
          v-model="form.name"
          placeholder="代理节点名称（可选）"
        />
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">Authorization</label>
        <UInput
          v-model="form.authorization"
          placeholder="Bearer token（可选）"
        />
      </div>

      <div class="flex items-center gap-3 pt-2">
        <UButton type="submit" color="primary" :loading="submitting">
          {{ isEditing ? '更新' : '添加' }}
        </UButton>
        <UButton color="gray" variant="ghost" @click="handleCancel">
          取消
        </UButton>
      </div>
    </form>
  </UCard>
</template>
