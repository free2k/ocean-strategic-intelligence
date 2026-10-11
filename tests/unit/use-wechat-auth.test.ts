import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock import.meta.server
vi.stubGlobal('import', { meta: { server: false } });

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: () => { store = {}; },
    get _store() { return store; },
  };
})();

vi.stubGlobal('localStorage', localStorageMock);

// Mock $fetch
const fetchMock = vi.fn();
vi.stubGlobal('$fetch', fetchMock);

// We need to reset module state between tests since the composable uses module-level refs
let useWechatAuth: typeof import('../../composables/useWechatAuth').useWechatAuth;

describe('useWechatAuth', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    localStorageMock.clear();
    fetchMock.mockReset();

    // Re-import to reset module-level state
    vi.resetModules();
    const mod = await import('../../composables/useWechatAuth');
    useWechatAuth = mod.useWechatAuth;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initFromStorage', () => {
    it('loads auth state from localStorage', async () => {
      localStorageMock.setItem('wechat-auth-key', 'test-key-123');
      localStorageMock.setItem('wechat-nickname', 'TestUser');
      localStorageMock.setItem('wechat-avatar', 'https://example.com/avatar.jpg');

      // Re-import to trigger initFromStorage with populated localStorage
      vi.resetModules();
      const mod = await import('../../composables/useWechatAuth');
      const { isLoggedIn, nickname, avatar, authKey } = mod.useWechatAuth();

      expect(isLoggedIn.value).toBe(true);
      expect(authKey.value).toBe('test-key-123');
      expect(nickname.value).toBe('TestUser');
      expect(avatar.value).toBe('https://example.com/avatar.jpg');
    });

    it('remains logged out when no stored key', () => {
      const { isLoggedIn, nickname, avatar } = useWechatAuth();

      expect(isLoggedIn.value).toBe(false);
      expect(nickname.value).toBe('');
      expect(avatar.value).toBe('');
    });
  });

  describe('login', () => {
    it('fetches QR code and sets scanning status', async () => {
      fetchMock.mockResolvedValueOnce({
        success: true,
        imageUrl: 'data:image/jpeg;base64,abc123',
        sessionId: 'session-1',
      });

      // Mock the status polling to return waiting
      fetchMock.mockResolvedValue({ status: 'waiting' });

      const { login, qrCodeUrl, loginStatus } = useWechatAuth();

      await login();

      expect(fetchMock).toHaveBeenCalledWith('/api/wechat/auth/qrcode');
      expect(qrCodeUrl.value).toBe('data:image/jpeg;base64,abc123');
      expect(loginStatus.value).toBe('scanning');
    });

    it('sets expired status when QR code fetch fails', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const { login, loginStatus } = useWechatAuth();

      await login();

      expect(loginStatus.value).toBe('expired');
    });

    it('sets expired status when response has no imageUrl', async () => {
      fetchMock.mockResolvedValueOnce({
        success: false,
        imageUrl: '',
        sessionId: '',
      });

      const { login, loginStatus } = useWechatAuth();

      await login();

      expect(loginStatus.value).toBe('expired');
    });
  });

  describe('checkStatus (polling)', () => {
    it('updates status to scanned when server returns scanned', async () => {
      fetchMock.mockResolvedValueOnce({
        success: true,
        imageUrl: 'data:image/jpeg;base64,qr',
        sessionId: 'sess-1',
      });

      // First poll returns scanned
      fetchMock.mockResolvedValueOnce({ status: 'scanned' });

      const { login, loginStatus } = useWechatAuth();

      await login();

      // Advance timer to trigger first poll
      await vi.advanceTimersByTimeAsync(2000);

      expect(loginStatus.value).toBe('scanned');
    });

    it('saves credentials on confirmed status', async () => {
      fetchMock.mockResolvedValueOnce({
        success: true,
        imageUrl: 'data:image/jpeg;base64,qr',
        sessionId: 'sess-1',
      });

      fetchMock.mockResolvedValueOnce({
        status: 'confirmed',
        authKey: 'new-auth-key',
        nickname: 'WeChatUser',
        avatar: 'https://wx.qq.com/avatar.png',
      });

      const { login, isLoggedIn, authKey, nickname, avatar, loginStatus } = useWechatAuth();

      await login();
      await vi.advanceTimersByTimeAsync(2000);

      expect(loginStatus.value).toBe('confirmed');
      expect(isLoggedIn.value).toBe(true);
      expect(authKey.value).toBe('new-auth-key');
      expect(nickname.value).toBe('WeChatUser');
      expect(avatar.value).toBe('https://wx.qq.com/avatar.png');

      // Verify localStorage persistence
      expect(localStorageMock.setItem).toHaveBeenCalledWith('wechat-auth-key', 'new-auth-key');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('wechat-nickname', 'WeChatUser');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('wechat-avatar', 'https://wx.qq.com/avatar.png');
    });

    it('stops polling on expired status', async () => {
      fetchMock.mockResolvedValueOnce({
        success: true,
        imageUrl: 'data:image/jpeg;base64,qr',
        sessionId: 'sess-1',
      });

      fetchMock.mockResolvedValueOnce({ status: 'expired' });

      const { login, loginStatus } = useWechatAuth();

      await login();
      await vi.advanceTimersByTimeAsync(2000);

      expect(loginStatus.value).toBe('expired');

      // Verify no more polling happens
      const callCount = fetchMock.mock.calls.length;
      await vi.advanceTimersByTimeAsync(4000);
      expect(fetchMock.mock.calls.length).toBe(callCount);
    });
  });

  describe('logout', () => {
    it('calls logout API and clears state', async () => {
      // Set up logged-in state
      localStorageMock.setItem('wechat-auth-key', 'existing-key');
      localStorageMock.setItem('wechat-nickname', 'User');
      localStorageMock.setItem('wechat-avatar', 'https://avatar.url');

      vi.resetModules();
      const mod = await import('../../composables/useWechatAuth');
      const { logout, isLoggedIn, authKey, nickname, avatar } = mod.useWechatAuth();

      expect(isLoggedIn.value).toBe(true);

      fetchMock.mockResolvedValueOnce({ success: true });

      await logout();

      expect(fetchMock).toHaveBeenCalledWith('/api/wechat/auth/logout', {
        method: 'POST',
        body: { authKey: 'existing-key' },
      });
      expect(isLoggedIn.value).toBe(false);
      expect(authKey.value).toBe('');
      expect(nickname.value).toBe('');
      expect(avatar.value).toBe('');

      // Verify localStorage cleared
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('wechat-auth-key');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('wechat-nickname');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('wechat-avatar');
    });

    it('clears state even if logout API fails', async () => {
      localStorageMock.setItem('wechat-auth-key', 'key-to-clear');

      vi.resetModules();
      const mod = await import('../../composables/useWechatAuth');
      const { logout, isLoggedIn } = mod.useWechatAuth();

      expect(isLoggedIn.value).toBe(true);

      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      await logout();

      expect(isLoggedIn.value).toBe(false);
    });
  });

  describe('expiresAt', () => {
    it('calculates expiresAt (4 days from now) on confirmed login', async () => {
      const fakeNow = new Date('2024-06-01T12:00:00Z').getTime();
      vi.setSystemTime(fakeNow);

      fetchMock.mockResolvedValueOnce({
        success: true,
        imageUrl: 'data:image/jpeg;base64,qr',
        sessionId: 'sess-1',
      });

      fetchMock.mockResolvedValueOnce({
        status: 'confirmed',
        authKey: 'auth-key-123',
        nickname: 'User',
        avatar: 'https://avatar.url',
      });

      const { login, expiresAt } = useWechatAuth();

      await login();
      await vi.advanceTimersByTimeAsync(2000);

      // After advancing 2s, Date.now() is fakeNow + 2000
      const fourDaysMs = 4 * 24 * 60 * 60 * 1000;
      const expectedExpiry = fakeNow + 2000 + fourDaysMs;
      expect(expiresAt.value).toBe(expectedExpiry);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('wechat-expires-at', String(expectedExpiry));
    });

    it('restores expiresAt from localStorage on init', async () => {
      const storedExpiry = String(Date.now() + 2 * 24 * 60 * 60 * 1000);
      localStorageMock.setItem('wechat-auth-key', 'some-key');
      localStorageMock.setItem('wechat-expires-at', storedExpiry);

      vi.resetModules();
      const mod = await import('../../composables/useWechatAuth');
      const { expiresAt } = mod.useWechatAuth();

      expect(expiresAt.value).toBe(Number(storedExpiry));
    });

    it('clears expiresAt on logout', async () => {
      localStorageMock.setItem('wechat-auth-key', 'key');
      localStorageMock.setItem('wechat-expires-at', '1717300000000');

      vi.resetModules();
      const mod = await import('../../composables/useWechatAuth');
      const { logout, expiresAt } = mod.useWechatAuth();

      fetchMock.mockResolvedValueOnce({ success: true });
      await logout();

      expect(expiresAt.value).toBe(0);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('wechat-expires-at');
    });

    it('getExpiresAt returns the current expiry timestamp', async () => {
      const storedExpiry = '1717300000000';
      localStorageMock.setItem('wechat-auth-key', 'some-key');
      localStorageMock.setItem('wechat-expires-at', storedExpiry);

      vi.resetModules();
      const mod = await import('../../composables/useWechatAuth');
      const { getExpiresAt } = mod.useWechatAuth();

      expect(getExpiresAt()).toBe(Number(storedExpiry));
    });
  });

  describe('isLoggedIn computed', () => {
    it('returns true when authKey is set', async () => {
      localStorageMock.setItem('wechat-auth-key', 'some-key');

      vi.resetModules();
      const mod = await import('../../composables/useWechatAuth');
      const { isLoggedIn } = mod.useWechatAuth();

      expect(isLoggedIn.value).toBe(true);
    });

    it('returns false when authKey is empty', () => {
      const { isLoggedIn } = useWechatAuth();
      expect(isLoggedIn.value).toBe(false);
    });
  });
});
