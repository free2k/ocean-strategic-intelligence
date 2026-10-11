import { ref, computed } from 'vue';

const STORAGE_KEY_AUTH = 'wechat-auth-key';
const STORAGE_KEY_NICKNAME = 'wechat-nickname';
const STORAGE_KEY_AVATAR = 'wechat-avatar';
const STORAGE_KEY_EXPIRES = 'wechat-expires-at';

/** Polling interval for checking scan status (ms) */
const POLL_INTERVAL = 2000;

type LoginStatus = 'idle' | 'scanning' | 'scanned' | 'confirmed' | 'expired';

// Module-level state so it's shared across all component instances
const authKey = ref('');
const nickname = ref('');
const avatar = ref('');
const qrCodeUrl = ref('');
const loginStatus = ref<LoginStatus>('idle');
const expiresAt = ref(0);

let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Composable for managing WeChat MP login state.
 *
 * Handles QR code login flow, localStorage persistence of auth credentials,
 * and provides reactive state for the UI.
 */
export function useWechatAuth() {
  const isLoggedIn = computed(() => !!authKey.value);

  /**
   * Initialize state from localStorage on client side.
   */
  function initFromStorage() {
    if (import.meta.server) return;

    const storedKey = localStorage.getItem(STORAGE_KEY_AUTH);
    const storedNickname = localStorage.getItem(STORAGE_KEY_NICKNAME);
    const storedAvatar = localStorage.getItem(STORAGE_KEY_AVATAR);

    if (storedKey) {
      authKey.value = storedKey;
      nickname.value = storedNickname || '';
      avatar.value = storedAvatar || '';
    }

    const storedExpires = localStorage.getItem(STORAGE_KEY_EXPIRES);
    if (storedExpires) {
      expiresAt.value = Number(storedExpires);
    }
  }

  /**
   * Start the login flow: fetch QR code and begin polling for scan status.
   */
  async function login() {
    stopPolling();
    loginStatus.value = 'scanning';
    qrCodeUrl.value = '';

    try {
      const data = await $fetch<{
        success: boolean;
        imageUrl: string;
        sessionId: string;
      }>('/api/wechat/auth/qrcode');

      if (!data.success || !data.imageUrl) {
        loginStatus.value = 'expired';
        return;
      }

      qrCodeUrl.value = data.imageUrl;
      checkStatus(data.sessionId);
    } catch (error) {
      console.error('[useWechatAuth] Failed to get QR code:', error);
      loginStatus.value = 'expired';
    }
  }

  /**
   * Poll the auth status endpoint every 2 seconds until confirmed or expired.
   */
  function checkStatus(sessionId: string) {
    stopPolling();

    pollTimer = setInterval(async () => {
      try {
        const data = await $fetch<{
          status: 'waiting' | 'scanned' | 'confirmed' | 'expired';
          nickname?: string;
          avatar?: string;
          authKey?: string;
        }>('/api/wechat/auth/status', {
          params: { sessionId },
        });

        switch (data.status) {
          case 'waiting':
            loginStatus.value = 'scanning';
            break;

          case 'scanned':
            loginStatus.value = 'scanned';
            break;

          case 'confirmed':
            loginStatus.value = 'confirmed';
            stopPolling();

            // Save credentials
            if (data.authKey) {
              authKey.value = data.authKey;
              nickname.value = data.nickname || '';
              avatar.value = data.avatar || '';

              // Calculate expiry: 4 days from now (matches server-side cookie TTL)
              const expiry = Date.now() + 4 * 24 * 60 * 60 * 1000;
              expiresAt.value = expiry;

              // Persist to localStorage
              localStorage.setItem(STORAGE_KEY_AUTH, data.authKey);
              localStorage.setItem(STORAGE_KEY_EXPIRES, String(expiry));
              localStorage.setItem(STORAGE_KEY_NICKNAME, data.nickname || '');
              localStorage.setItem(STORAGE_KEY_AVATAR, data.avatar || '');
            }
            break;

          case 'expired':
            loginStatus.value = 'expired';
            stopPolling();
            break;
        }
      } catch (error) {
        console.error('[useWechatAuth] Status polling error:', error);
        loginStatus.value = 'expired';
        stopPolling();
      }
    }, POLL_INTERVAL);
  }

  /**
   * Log out: call the server logout endpoint and clear all local state.
   */
  async function logout() {
    try {
      if (authKey.value) {
        await $fetch('/api/wechat/auth/logout', {
          method: 'POST',
          body: { authKey: authKey.value },
        });
      }
    } catch (error) {
      console.error('[useWechatAuth] Logout request failed:', error);
    } finally {
      // Always clear local state regardless of server response
      clearState();
    }
  }

  /**
   * Clear all auth state and localStorage entries.
   */
  function clearState() {
    stopPolling();
    authKey.value = '';
    nickname.value = '';
    avatar.value = '';
    qrCodeUrl.value = '';
    loginStatus.value = 'idle';
    expiresAt.value = 0;

    if (!import.meta.server) {
      localStorage.removeItem(STORAGE_KEY_AUTH);
      localStorage.removeItem(STORAGE_KEY_NICKNAME);
      localStorage.removeItem(STORAGE_KEY_AVATAR);
      localStorage.removeItem(STORAGE_KEY_EXPIRES);
    }
  }

  /**
   * Stop the polling timer if active.
   */
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // Auto-initialize from storage on first use (client-side only)
  initFromStorage();

  /**
   * Get the expiration timestamp for the current login session.
   */
  function getExpiresAt(): number {
    return expiresAt.value;
  }

  return {
    // State
    isLoggedIn,
    nickname,
    avatar,
    authKey,
    qrCodeUrl,
    loginStatus,
    expiresAt,

    // Methods
    login,
    logout,
    checkStatus,
    initFromStorage,
    getExpiresAt,
    stopPolling,
  };
}
