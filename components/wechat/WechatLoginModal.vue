<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const { qrCodeUrl, loginStatus, login, stopPolling } = useWechatAuth();

// Auto-fetch QR code when modal opens, stop polling when it closes
watch(isOpen, (open) => {
  if (open) {
    login();
  } else if (loginStatus.value !== 'confirmed') {
    stopPolling();
  }
});

// Auto-close on confirmed
watch(loginStatus, (status) => {
  if (status === 'confirmed') {
    isOpen.value = false;
  }
});
</script>

<template>
  <UModal v-model="isOpen">
    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold">微信公众号登录</h3>
      </template>

      <div class="flex flex-col items-center space-y-4 py-4">
        <!-- Loading state -->
        <div v-if="loginStatus === 'scanning' && !qrCodeUrl" class="text-gray-500">
          正在获取二维码...
        </div>

        <!-- QR Code -->
        <div v-if="qrCodeUrl" class="border rounded-lg p-3 bg-white">
          <img :src="qrCodeUrl" alt="微信登录二维码" class="w-48 h-48" />
        </div>

        <!-- Status messages -->
        <p v-if="loginStatus === 'scanning' && qrCodeUrl" class="text-sm text-blue-600">
          请使用微信扫描二维码
        </p>
        <p v-else-if="loginStatus === 'scanned'" class="text-sm text-green-600">
          已扫码，请在手机上确认登录
        </p>
        <p v-else-if="loginStatus === 'expired'" class="text-sm text-red-500">
          二维码已过期
        </p>

        <!-- Retry button -->
        <UButton
          v-if="loginStatus === 'expired'"
          color="primary"
          @click="login"
        >
          重新获取二维码
        </UButton>
      </div>
    </UCard>
  </UModal>
</template>
