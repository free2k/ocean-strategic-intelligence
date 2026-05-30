<script setup lang="ts">
import { formatCountdown, isExpiringSoon } from '~/utils/wechat-countdown';

const { isLoggedIn, nickname, avatar, expiresAt, authKey, logout, initFromStorage } = useWechatAuth();
const showLoginModal = ref(false);
const countdownText = ref('');
const expiringSoon = ref(false);

let timer: ReturnType<typeof setInterval> | null = null;

function updateCountdown() {
  if (expiresAt.value > 0) {
    const now = Date.now();
    countdownText.value = formatCountdown(expiresAt.value, now);
    expiringSoon.value = isExpiringSoon(expiresAt.value, now);
  } else {
    countdownText.value = '';
    expiringSoon.value = false;
  }
}

// Validate login state against server on mount
async function validateSession() {
  if (!authKey.value) return;
  try {
    const data = await $fetch<{ loggedIn: boolean; nickname?: string; avatar?: string }>('/api/wechat/auth/me', {
      params: { authKey: authKey.value },
    });
    if (!data.loggedIn) {
      // Server says session expired, clear local state
      logout();
    }
  } catch {
    // Network error, keep local state as-is
  }
}

onMounted(() => {
  // Re-initialize from localStorage to ensure client-side hydration picks up stored state
  initFromStorage();
  updateCountdown();
  timer = setInterval(updateCountdown, 1000);
  // Validate with server
  validateSession();
});

onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
});
</script>

<template>
  <div class="p-4 border-t border-gray-200 dark:border-gray-700">
    <!-- Logged in state -->
    <div v-if="isLoggedIn" class="space-y-3">
      <div class="flex items-center gap-3">
        <img
          v-if="avatar"
          :src="avatar"
          :alt="nickname"
          referrerpolicy="no-referrer"
          class="w-8 h-8 rounded-full object-cover"
        />
        <div v-else class="w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center text-xs text-white">
          {{ nickname?.charAt(0) || '?' }}
        </div>
        <span class="text-sm font-medium truncate flex-1">{{ nickname || '已登录' }}</span>
        <UButton color="green" variant="soft" size="xs" @click="logout">
          退出
        </UButton>
      </div>
      <p
        v-if="countdownText"
        class="text-xs"
        :class="expiringSoon ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'"
      >
        登录信息过期时间还剩: {{ countdownText }}
      </p>
    </div>

    <!-- Not logged in state -->
    <div v-else>
      <UButton color="primary" block @click="showLoginModal = true">
        登录公众号
      </UButton>
    </div>

    <!-- Login Modal -->
    <WechatLoginModal v-model="showLoginModal" />
  </div>
</template>
